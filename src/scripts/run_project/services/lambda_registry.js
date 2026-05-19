import fs from 'fs';
import path from 'path';
import { FastlbsError } from '../../../utils/cli_error.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

function getFastLbsConfigPath() {
    const projectRoot = getProjectRootOrThrow();
    return path.join(projectRoot, 'fastlbs.config.json');
}

export function getRegisteredLambdaNames() {
    const configPath = getFastLbsConfigPath();
    if (!fs.existsSync(configPath)) {
        throw new FastlbsError('fastlbs.config.json not found in current directory.', {
            code: 'PROJECT_CONFIG_NOT_FOUND',
            hint: 'Run this command inside a FastLBS project.',
        });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const lambdas = config?.lambdas;
    if (!lambdas || typeof lambdas !== 'object') {
        return [];
    }

    return Object.keys(lambdas);
}
