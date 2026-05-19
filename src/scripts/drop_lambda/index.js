import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import pc from 'picocolors';
import figlet from 'figlet';

function toDocConstName(lambdaName) {
    const pascalName = lambdaName
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('');

    return `${pascalName || lambdaName}Doc`;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dropFastlbsConfig(lambdaName) {
    const configPath = path.join(process.cwd(), 'fastlbs.config.json');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        if (config.lambdas && config.lambdas[lambdaName]) {
            delete config.lambdas[lambdaName];
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
    }
}

function dropDocumentation(lambdaName){
    const docDir = path.join(process.cwd(), 'lambdas/__doc__/src/documents/lambdas', lambdaName + '.ts');
    if (fs.existsSync(docDir)) {
        fs.rmSync(docDir, { force: true });
    }
    const indexPath = path.join(process.cwd(), 'lambdas/__doc__/src/documents/index.ts');
    if (fs.existsSync(indexPath)) {
        let indexContent = fs.readFileSync(indexPath, 'utf-8');

        const docConstName = toDocConstName(lambdaName);
        const escapedDocConstName = escapeRegExp(docConstName);
        const escapedLambdaName = escapeRegExp(lambdaName);

        const importRegex = new RegExp(
            `^\\s*import\\s+\\{\\s*${escapedDocConstName}\\s*\\}\\s+from\\s+["']\\.\\/lambdas\\/${escapedLambdaName}(?:\\.ts)?["'];?\\s*\\r?\\n?`,
            'gm'
        );
        indexContent = indexContent.replace(importRegex, '');

        indexContent = indexContent.replace(
            /("paths"\s*:\s*\{)([\s\S]*?)(\n\s*\},)/m,
            (match, pathsStart, pathsBody, pathsEnd) => {
                const spreadRegex = new RegExp(`^\\s*\\.\\.\\.${escapedDocConstName}\\s*,?\\s*\\r?\\n?`, 'gm');
                const cleanedPathsBody = pathsBody.replace(spreadRegex, '');
                return `${pathsStart}${cleanedPathsBody}${pathsEnd}`;
            }
        );

        fs.writeFileSync(indexPath, indexContent, 'utf-8');
    }
}

function dropServerlessConfig(lambdaName) {
    const functionConfigPath = path.join(process.cwd(), 'serverlessConfig/functions', `${lambdaName}.json`);
    if (fs.existsSync(functionConfigPath)) {
        fs.rmSync(functionConfigPath, { force: true });
    }
}

export async function dropLambdaFunction(lambdaName) {
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
    const lambdaDir = path.join(process.cwd(), 'lambdas', lambdaName);
    if (fs.existsSync(lambdaDir)) {
        fs.rmSync(lambdaDir, { recursive: true, force: true });
    }
    dropFastlbsConfig(lambdaName);
    dropDocumentation(lambdaName);
    dropServerlessConfig(lambdaName);
    figlet.text('Lambda Dropped!', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    }, function(err, data) {
        if (err) {
            console.error('Something went wrong with figlet...');
            console.dir(err);
            return;
        }
        console.log(pc.green(data));
    });
}