import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import pc from 'picocolors';
import figlet from 'figlet';
import { assertPathInsideProject, assertValidLambdaName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { autoGenerateServerless } from '../serverless/index.js';

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

function findMatchingBrace(content, openBraceIndex) {
    let depth = 0;
    let inString = false;
    let stringDelimiter = '';
    let escaped = false;

    for (let i = openBraceIndex; i < content.length; i++) {
        const ch = content[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === stringDelimiter) {
                inString = false;
                stringDelimiter = '';
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringDelimiter = ch;
            continue;
        }

        if (ch === '{') {
            depth += 1;
            continue;
        }

        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function removeDocFromPaths(indexContent, docConstName) {
    const pathsMatch = indexContent.match(/["']?paths["']?\s*:\s*\{/m);
    if (!pathsMatch || pathsMatch.index === undefined) {
        return indexContent;
    }

    const openBraceIndex = pathsMatch.index + pathsMatch[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingBrace(indexContent, openBraceIndex);

    if (closeBraceIndex === -1) {
        return indexContent;
    }

    const pathsBody = indexContent.slice(openBraceIndex + 1, closeBraceIndex);
    const escapedDocConstName = escapeRegExp(docConstName);
    const spreadRegex = new RegExp(`(^\\s*\\.\\.\\.${escapedDocConstName}\\s*,?\\s*$\\n?)`, 'gm');
    const cleanedBody = pathsBody.replace(spreadRegex, '');

    return `${indexContent.slice(0, openBraceIndex + 1)}${cleanedBody}${indexContent.slice(closeBraceIndex)}`;
}

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

function dropDocumentation(projectRoot, lambdaName){
    const docDir = path.join(projectRoot, 'lambdas/__doc__/src/documents/lambdas', lambdaName + '.ts');
    if (fs.existsSync(docDir)) {
        fs.rmSync(docDir, { force: true });
    }
    const indexPath = path.join(projectRoot, 'lambdas/__doc__/src/documents/index.ts');
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

        indexContent = removeDocFromPaths(indexContent, docConstName);

        fs.writeFileSync(indexPath, indexContent, 'utf-8');
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
    dropDocumentation(projectRoot, lambdaName);
    dropServerlessConfig(projectRoot, lambdaName);
    autoGenerateServerless()

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