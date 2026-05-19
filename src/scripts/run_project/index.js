import nodemon from 'nodemon';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearConsole } from '../../utils/clear_console.js';
import { getRegisteredLambdaNames } from './services/lambda_registry.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCH_EXTENSIONS = 'ts,json';
const IGNORE_PATTERNS = ['**/*.spec.ts'];

function resolveTargetLambdas(lambdaName) {
    if (lambdaName) {
        return [lambdaName];
    }

    const allLambdas = getRegisteredLambdaNames();
    if (!allLambdas.length) {
        throw new Error('No lambdas registered in fastlbs.config.json');
    }

    return allLambdas;
}

export function runProject(lambdaName) {
    const runnerPath = path.join(__dirname, 'services', 'dev_runner.js');
    const projectRoot = getProjectRootOrThrow();
    const targetLambdas = resolveTargetLambdas(lambdaName);
    const watchPaths = [
        ...targetLambdas.map((name) => path.join(projectRoot, 'lambdas', name, 'src')),
        path.join(projectRoot, 'lambdas', '__doc__', 'src'),
        path.join(projectRoot, 'libs', 'common'),
        path.join(projectRoot, 'serverlessConfig'),
        path.join(projectRoot, 'fastlbs.config.json'),
    ];

    clearConsole();
    nodemon({
        script: runnerPath,
        args: [lambdaName ?? '__all__'],
        exec: 'node',
        watch: watchPaths,
        ext: WATCH_EXTENSIONS,
        ignore: IGNORE_PATTERNS,
        delay: 200,
    });

    nodemon.on('restart', (files) => {
        if (files?.length) {
            console.log(`Rebuilding because of changes in: ${files.join(', ')}`);
        }
    });

    nodemon.on('quit', () => {
        process.exit();
    });
}