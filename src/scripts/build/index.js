import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { assertPathInsideProject, assertValidLambdaName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';

export async function buildProject(lambdaName) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();
    const entryPoint = path.resolve(projectRoot, 'lambdas', lambdaName, 'src', 'index.ts');
    const outputFile = path.resolve(projectRoot, 'dist', lambdaName, 'index.js');

    assertPathInsideProject(projectRoot, entryPoint, 'build entry point');
    assertPathInsideProject(projectRoot, outputFile, 'build output path');

    if (!fs.existsSync(entryPoint)) {
        throw new Error(`Entry point not found: ${entryPoint}`);
    }

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    await build({
        entryPoints: [entryPoint],
        bundle: true,
        outfile: outputFile,
        minify: true,
        platform: 'node',
        format: 'esm',
        sourcemap: false,
    });

}