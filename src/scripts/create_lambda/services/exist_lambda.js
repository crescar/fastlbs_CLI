import fs from 'fs';
import path from 'path';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';
export function existLambda(lambdaName) {
    const projectRoot = getProjectRootOrThrow();
    const filePath = path.join(projectRoot, 'fastlbs.config.json');
    if (!fs.existsSync(filePath)) {
        console.error('fastlbs.config.json not found. Please make sure you are in the root directory of a FastLBS project.');
        return {
            fileNotFound: true,
            exists: false
        }
    }
    const configContent = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(configContent);
    const lambdas = config?.lambdas && typeof config.lambdas === 'object' ? config.lambdas : {};
    const exists = !!lambdas[lambdaName];
    return {
        fileNotFound: false,
        exists,
    };
}