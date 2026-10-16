import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import pc from 'picocolors';
import figlet from 'figlet';
import { assertPathInsideProject, assertValidLambdaName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { autoGenerateServerless } from '../serverless/index.js';
import { unregisterLambdaDoc } from '../../services/docs/doc_manager.js';

function dropFastlbsConfig(projectRoot, lambdaName) {
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        if (config.lambdas && config.lambdas[lambdaName]) {
            delete config.lambdas[lambdaName];
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
    }
}

function dropServerlessConfig(projectRoot, lambdaName) {
    const functionConfigPath = path.join(projectRoot, 'serverlessConfig/functions', `${lambdaName}.json`);
    if (fs.existsSync(functionConfigPath)) {
        fs.rmSync(functionConfigPath, { force: true });
    }
}

export async function dropLambdaFunction(lambdaName) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();

    const response = await enquirer.prompt({
        type: 'confirm',
        name: 'confirmDrop',
        message: pc.yellow(`Are you sure you want to drop the lambda "${lambdaName}"? This action cannot be undone.`),
        initial: false
    });

    if (!response.confirmDrop) {
        console.log(pc.yellow('Lambda drop cancelled.'));
        return;
    }

    const lambdaDir = path.join(projectRoot, 'lambdas', lambdaName);
    assertPathInsideProject(projectRoot, lambdaDir, 'lambda directory');

    if (fs.existsSync(lambdaDir)) {
        fs.rmSync(lambdaDir, { recursive: true, force: true });
    }

    dropFastlbsConfig(projectRoot, lambdaName);
    unregisterLambdaDoc(projectRoot, lambdaName);
    dropServerlessConfig(projectRoot, lambdaName);
    autoGenerateServerless();

    const figletText = await new Promise((resolve) => {
        figlet('Lambda Dropped!', { font: 'Standard' }, (err, data) => {
            if (err) {
                resolve('Lambda Dropped!');
                return;
            }
            resolve(data);
        });
    });

    console.log(pc.green(figletText));
}