import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { createBaseContext } from '../new_project/services/create_base_context.js';
import { createHandlerResponses } from '../new_project/services/create_handler_responses.js';
import { createValidatorBaseMiddleware } from '../new_project/services/validator_base_middleware.js';
import { createBaseWrapper } from '../new_project/services/create_base_wrapper.js';
import { createZodOpenApiUtil } from '../new_project/services/create_zod_openapi_util.js';
import { ensureCommonI18n } from '../new_project/services/create_base_i18n.js';
import { getProjectI18nConfig } from '../../services/i18n/i18n_scaffolder.js';
import { autoGenerateServerless } from '../serverless/index.js';

const CLI_PACKAGE_JSON_PATH = new URL('../../../package.json', import.meta.url);

function getCliVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(CLI_PACKAGE_JSON_PATH, 'utf-8'));
        return pkg.version || '2.0.1';
    } catch {
        return '2.0.1';
    }
}

const MANAGED_RUNTIME_FILES = [
    'libs/common/context/fastlbsContext.ts',
    'libs/common/wrappers/handlerResponse.wrapper.ts',
    'libs/common/middlewares/validator.middleware.ts',
    'libs/common/utils/handlerErrorResponse.util.ts',
    'libs/common/utils/handlerStandardResponse.util.ts',
    'libs/common/utils/zodOpenApi.util.ts',
    'libs/common/i18n/index.ts',
];

function generateExpectedRuntimeFiles(i18nSettings) {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.fastlbs-upgrade-tmp-'));
    const tempProjName = 'upgrade_ref';
    const prevCwd = process.cwd();
    try {
        process.chdir(tempDir);
        createBaseContext(tempProjName);
        createHandlerResponses(tempProjName);
        createValidatorBaseMiddleware(tempProjName);
        createBaseWrapper(tempProjName);
        createZodOpenApiUtil(tempProjName);
        const refRoot = path.join(tempDir, tempProjName);
        ensureCommonI18n(refRoot, {
            defaultLocale: i18nSettings.defaultLocale,
            locales: i18nSettings.locales,
            overwriteRuntime: true,
        });

        const fileMap = {};
        for (const relPath of MANAGED_RUNTIME_FILES) {
            const fullRefPath = path.join(refRoot, relPath);
            if (fs.existsSync(fullRefPath)) {
                fileMap[relPath] = fs.readFileSync(fullRefPath, 'utf-8');
            }
        }
        return fileMap;
    } finally {
        process.chdir(prevCwd);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

function upgradeServerlessPackaging(projectRoot) {
    const baseServerlessPath = path.join(projectRoot, 'serverlessConfig', 'basicServerlessConfig.json');
    if (!fs.existsSync(baseServerlessPath)) {
        return false;
    }

    try {
        const raw = fs.readFileSync(baseServerlessPath, 'utf-8');
        const cfg = JSON.parse(raw);
        let changed = false;

        if (!cfg.build || cfg.build.esbuild !== false) {
            cfg.build = { ...(cfg.build || {}), esbuild: false };
            changed = true;
        }

        if (!cfg.package || cfg.package.individually !== true) {
            cfg.package = {
                individually: true,
                excludeDevDependencies: true,
                patterns: ['!**'],
            };
            changed = true;
        }

        const docPackage = {
            patterns: ['dist/__doc__/**', 'node_modules/swagger-ui-dist/**'],
        };
        if (cfg.functions) {
            for (const docFn of ['__doc__', '__doc__/json', '__doc__/static']) {
                if (cfg.functions[docFn] && !cfg.functions[docFn].package) {
                    cfg.functions[docFn].package = docPackage;
                    changed = true;
                }
            }
        }

        if (changed) {
            fs.writeFileSync(baseServerlessPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
        }
        return changed;
    } catch {
        return false;
    }
}

export async function upgradeProjectRuntime(options = {}) {
    const projectRoot = options.projectRoot || getProjectRootOrThrow();
    const cliVersion = getCliVersion();
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    let currentRuntimeVersion = '1.0.0';
    if (fs.existsSync(configPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            currentRuntimeVersion = cfg.runtimeVersion || cfg.frameworkVersion || '1.0.0';
        } catch {
            // Ignore
        }
    }

    const i18nSettings = getProjectI18nConfig(projectRoot);
    const expectedFiles = generateExpectedRuntimeFiles(i18nSettings);

    const outdatedFiles = [];
    const upToDateFiles = [];

    for (const [relPath, expectedContent] of Object.entries(expectedFiles)) {
        const targetPath = path.join(projectRoot, relPath);
        if (!fs.existsSync(targetPath)) {
            outdatedFiles.push({ relPath, targetPath, status: 'missing', expectedContent });
            continue;
        }
        const currentContent = fs.readFileSync(targetPath, 'utf-8');
        if (currentContent.trim() !== expectedContent.trim()) {
            outdatedFiles.push({ relPath, targetPath, status: 'outdated', expectedContent });
        } else {
            upToDateFiles.push(relPath);
        }
    }

    if (options.check) {
        if (outdatedFiles.length === 0 && currentRuntimeVersion === cliVersion) {
            console.log(
                pc.green(`✔ FastLBS runtime is up to date (v${cliVersion}). All ${upToDateFiles.length} shared files match.`)
            );
        } else {
            console.log(
                pc.yellow(
                    `⚠ Project runtime (v${currentRuntimeVersion}) has ${outdatedFiles.length} file(s) ready to upgrade to CLI v${cliVersion}:`
                )
            );
            for (const item of outdatedFiles) {
                console.log(pc.cyan(`  - [${item.status}] ${item.relPath}`));
            }
            console.log(pc.dim(`  Run "fastlbs upgrade" to apply the latest runtime updates.`));
        }
        return {
            upToDate: outdatedFiles.length === 0,
            cliVersion,
            currentRuntimeVersion,
            outdatedFiles: outdatedFiles.map((f) => f.relPath),
            upToDateFiles,
        };
    }

    const createBackups = options.backup !== false;
    const backups = [];
    const updated = [];

    for (const item of outdatedFiles) {
        fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
        if (item.status === 'outdated' && createBackups && fs.existsSync(item.targetPath)) {
            const bakPath = `${item.targetPath}.bak`;
            fs.copyFileSync(item.targetPath, bakPath);
            backups.push(path.relative(projectRoot, bakPath));
        }
        fs.writeFileSync(item.targetPath, item.expectedContent, 'utf-8');
        updated.push(item.relPath);
    }

    // Ensure common i18n locale files exist as well
    ensureCommonI18n(projectRoot, {
        defaultLocale: i18nSettings.defaultLocale,
        locales: i18nSettings.locales,
    });

    const packagingUpdated = upgradeServerlessPackaging(projectRoot);
    try {
        autoGenerateServerless({ projectRoot });
    } catch {
        // Ignore if serverlessConfig is incomplete in test fixtures
    }

    if (fs.existsSync(configPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            cfg.runtimeVersion = cliVersion;
            cfg.frameworkVersion = '2';
            if (!cfg.apiGateway) {
                cfg.apiGateway = 'http';
            }
            fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
        } catch {
            // Ignore
        }
    }

    console.log(pc.green(`✔ FastLBS project runtime upgraded to v${cliVersion}!`));
    if (updated.length > 0) {
        console.log(pc.cyan(`  Updated (${updated.length}): ${updated.join(', ')}`));
    } else {
        console.log(pc.dim(`  All ${upToDateFiles.length} runtime files in libs/common/ were already current.`));
    }
    if (backups.length > 0) {
        console.log(pc.dim(`  Backups created (${backups.length}): ${backups.join(', ')}`));
    }
    if (packagingUpdated) {
        console.log(pc.cyan(`  Serverless packaging upgraded to individual per-lambda bundles.`));
    }

    return {
        upToDate: true,
        cliVersion,
        updated,
        backups,
        packagingUpdated,
    };
}
