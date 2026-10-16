import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import { build } from 'esbuild';
import enquirer from 'enquirer';
import pc from 'picocolors';
import { assertPathInsideProject, assertValidLambdaName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastlbsError } from '../../utils/cli_error.js';
import { syncLambdaFunctionConfig, syncAllLambdasConfig } from '../../services/serverless/lambda_config_sync.js';

const NODE_BUILTINS = new Set([
    ...builtinModules,
    ...builtinModules.map((mod) => `node:${mod}`),
]);

export function normalizeBuildType(rawType) {
    if (!rawType) return null;
    const normalized = String(rawType).toLowerCase().trim();
    if (normalized === 'bundle' || normalized === 'single' || normalized === 'inlined') {
        return 'bundle';
    }
    if (normalized === 'modular' || normalized === 'standalone' || normalized === 'layers') {
        return 'modular';
    }
    return null;
}

export function extractUsedDependencies(metafile, projectRoot, lambdaName) {
    if (!metafile || !metafile.outputs) {
        return {};
    }

    const rootPackageJsonPath = path.join(projectRoot, 'package.json');
    let rootDependencies = {};
    let rootDevDependencies = {};

    if (fs.existsSync(rootPackageJsonPath)) {
        try {
            const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'));
            rootDependencies = rootPkg.dependencies || {};
            rootDevDependencies = rootPkg.devDependencies || {};
        } catch {
            // Ignore parse errors, fallback to empty
        }
    }

    const fastlbsConfigPath = path.join(projectRoot, 'fastlbs.config.json');
    let serviceName = '';
    if (fs.existsSync(fastlbsConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(fastlbsConfigPath, 'utf-8'));
            serviceName = config.service || '';
        } catch {
            // Ignore
        }
    }

    const detectedPackageNames = new Set();

    for (const outputMeta of Object.values(metafile.outputs)) {
        const imports = outputMeta.imports || [];
        for (const item of imports) {
            const importPath = item.path;
            if (!importPath || importPath.startsWith('.') || path.isAbsolute(importPath)) {
                continue;
            }

            // Extract root package name (e.g. '@aws-sdk/client-s3' or 'zod')
            let packageName = '';
            if (importPath.startsWith('@')) {
                const parts = importPath.split('/');
                packageName = parts.slice(0, 2).join('/');
            } else {
                packageName = importPath.split('/')[0];
            }

            if (!packageName || NODE_BUILTINS.has(packageName) || NODE_BUILTINS.has(`node:${packageName}`)) {
                continue;
            }

            // Skip internal workspace aliases like @serviceName/common
            if (serviceName && packageName.startsWith(`@${serviceName}`)) {
                continue;
            }

            detectedPackageNames.add(packageName);
        }
    }

    const lambdaDependencies = {};
    for (const pkgName of [...detectedPackageNames].sort()) {
        const version = rootDependencies[pkgName] || rootDevDependencies[pkgName] || '*';
        lambdaDependencies[pkgName] = version;
    }

    return lambdaDependencies;
}

async function resolveBuildType(lambdaName, explicitType) {
    if (explicitType) {
        const normalized = normalizeBuildType(explicitType);
        if (!normalized) {
            throw new FastlbsError(`Invalid build type "${explicitType}".`, {
                code: 'INVALID_BUILD_TYPE',
                hint: 'Supported build types are: "bundle" (single-file) or "modular" (with package.json).',
            });
        }
        return normalized;
    }

    // If stdin is interactive, prompt the user
    if (process.stdin.isTTY) {
        const response = await enquirer.prompt({
            type: 'select',
            name: 'buildType',
            message: `Select build strategy for lambda "${lambdaName}":`,
            choices: [
                {
                    name: 'bundle',
                    message: 'Single-file bundle (inlines all dependencies into index.js - zero extra files)',
                },
                {
                    name: 'modular',
                    message: 'Modular / Layer-friendly (keeps dependencies external + auto-generates minimal package.json)',
                },
            ],
            initial: 0,
        });
        return response.buildType;
    }

    // Default to 'bundle' in non-interactive CI/CD environments
    return 'bundle';
}

async function buildBundleStrategy(entryPoint, outputFile, lambdaName) {
    await build({
        entryPoints: [entryPoint],
        bundle: true,
        outfile: outputFile,
        minify: true,
        platform: 'node',
        format: 'esm',
        banner: {
            js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
        },
        sourcemap: false,
    });

    console.log(pc.green(`✔ Lambda "${lambdaName}" compiled successfully! [Strategy: Single-file bundle]`));
    console.log(pc.cyan(`  Output: ${outputFile}`));
    console.log(pc.dim(`  Cold start tip: Self-contained file. For large libraries, consider "--type modular" with Lambda Layers.`));
}

async function buildModularStrategy(entryPoint, outputFile, lambdaName, projectRoot) {
    const result = await build({
        entryPoints: [entryPoint],
        bundle: true,
        packages: 'external',
        outfile: outputFile,
        minify: true,
        platform: 'node',
        format: 'esm',
        metafile: true,
        banner: {
            js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
        },
        sourcemap: false,
    });

    const dependencies = extractUsedDependencies(result.metafile, projectRoot, lambdaName);
    const distDir = path.dirname(outputFile);

    const fastlbsConfigPath = path.join(projectRoot, 'fastlbs.config.json');
    let serviceName = 'lambda';
    if (fs.existsSync(fastlbsConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(fastlbsConfigPath, 'utf-8'));
            serviceName = config.service || 'lambda';
        } catch {
            // Ignore
        }
    }

    const packageJsonContent = {
        name: `${serviceName}-${lambdaName}`,
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies,
    };

    const packageJsonPath = path.join(distDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2), 'utf-8');

    const depCount = Object.keys(dependencies).length;
    console.log(pc.green(`✔ Lambda "${lambdaName}" compiled successfully! [Strategy: Modular with isolated package.json]`));
    console.log(pc.cyan(`  Output:       ${outputFile}`));
    console.log(pc.cyan(`  Package JSON: ${packageJsonPath}`));
    console.log(pc.cyan(`  Dependencies (${depCount}): ${Object.keys(dependencies).join(', ') || 'none'}`));
    console.log(pc.dim(`  Cold start tip: Run "npm install --omit=dev" in ${distDir} or package into an AWS Lambda Layer to minimize cold starts.`));
}

export async function buildProject(lambdaName, options = {}) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();
    const entryPoint = path.resolve(projectRoot, 'lambdas', lambdaName, 'src', 'index.ts');
    const outputFile = path.resolve(projectRoot, 'dist', lambdaName, 'index.js');

    assertPathInsideProject(projectRoot, entryPoint, 'build entry point');
    assertPathInsideProject(projectRoot, outputFile, 'build output path');

    if (!fs.existsSync(entryPoint)) {
        throw new FastlbsError(`Entry point not found for lambda "${lambdaName}": ${path.relative(projectRoot, entryPoint)}`, {
            code: 'ENTRY_POINT_NOT_FOUND',
            hint: `Ensure "lambdas/${lambdaName}/src/index.ts" exists.`,
        });
    }

    if (lambdaName === '__doc__') {
        syncAllLambdasConfig(projectRoot);
    } else {
        syncLambdaFunctionConfig(projectRoot, lambdaName);
    }

    const buildType = await resolveBuildType(lambdaName, options.type);

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    if (buildType === 'modular') {
        await buildModularStrategy(entryPoint, outputFile, lambdaName, projectRoot);
    } else {
        await buildBundleStrategy(entryPoint, outputFile, lambdaName);
    }
}