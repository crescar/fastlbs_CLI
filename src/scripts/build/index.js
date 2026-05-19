import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

export async function buildProject(lambdaName) {
    const projectRoot = process.cwd();
    const entryPoint = path.resolve(projectRoot, 'lambdas', lambdaName, 'src', 'index.ts');
    const outputFile = path.resolve(projectRoot, 'dist', lambdaName, 'index.js');

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