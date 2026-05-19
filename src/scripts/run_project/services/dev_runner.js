import { spawn } from 'child_process';
import { autoGenerateServerless } from '../../serverless/index.js';
import { buildProject } from '../../build/index.js';
import { pathToFileURL } from 'url';
import { clearConsole } from '../../../utils/clear_console.js';
import { getRegisteredLambdaNames } from './lambda_registry.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

const DOC_LAMBDA_NAME = '__doc__';
const ALL_LAMBDAS_FLAG = '__all__';

function startProjectServer(projectRoot) {
    return spawn('npm', ['run', 'start'], {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
    });
}

function resolveTargetLambdas(lambdaName) {
    if (lambdaName && lambdaName !== ALL_LAMBDAS_FLAG) {
        return [lambdaName];
    }

    const allLambdas = getRegisteredLambdaNames();
    if (!allLambdas.length) {
        throw new Error('No lambdas registered in fastlbs.config.json');
    }

    return allLambdas;
}

async function prepareProject(lambdaName) {
    const targetLambdas = resolveTargetLambdas(lambdaName);
    for (const name of targetLambdas) {
        await buildProject(name);
    }
    await buildProject(DOC_LAMBDA_NAME);
    autoGenerateServerless();
}

export async function runDevRunner(lambdaName) {
    if (lambdaName === undefined) {
        throw new Error('lambdaName argument is required');
    }

    const projectRoot = getProjectRootOrThrow();
    clearConsole();
    await prepareProject(lambdaName);
    const serverProcess = startProjectServer(projectRoot);

    const shutdown = () => {
        if (!serverProcess.killed) {
            serverProcess.kill();
        }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    serverProcess.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

const executedDirectly =
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
    runDevRunner(process.argv[2]).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}