import fs from 'fs';
import path from 'path';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

export function updateFastLbsConfigJson(lambdaName, kind = 'http') {
    const projectRoot = getProjectRootOrThrow();
    const filePath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(filePath)) {
        const configContent = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(configContent);
        config.lambdas = config?.lambdas && typeof config.lambdas === 'object' ? config.lambdas : {};
        config.lambdas[lambdaName] = {
            directory: `lambdas/${lambdaName}`,
            kind,
        };
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
}

export function getProjectAuxiliaryLambdas() {
    const projectRoot = getProjectRootOrThrow();
    const filePath = path.join(projectRoot, 'fastlbs.config.json');
    if (!fs.existsSync(filePath)) {
        return { authorizers: [], auxiliaries: [] };
    }
    try {
        const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const lambdas = config?.lambdas || {};
        const authorizers = [];
        const auxiliaries = [];
        for (const [name, meta] of Object.entries(lambdas)) {
            if (meta?.kind === 'authorizer') {
                authorizers.push(name);
            } else if (meta?.kind === 'auxiliary') {
                auxiliaries.push(name);
            } else {
                const srcPath = path.join(projectRoot, 'lambdas', name, 'src', 'index.ts');
                if (fs.existsSync(srcPath)) {
                    const src = fs.readFileSync(srcPath, 'utf-8');
                    if (/\bhandlerAuthorizer\b/.test(src)) {
                        authorizers.push(name);
                    } else if (/\bhandlerAuxiliary\b/.test(src)) {
                        auxiliaries.push(name);
                    }
                }
            }
        }
        return { authorizers, auxiliaries };
    } catch {
        return { authorizers: [], auxiliaries: [] };
    }
}