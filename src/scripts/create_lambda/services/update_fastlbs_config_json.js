import fs from 'fs';
import path from 'path';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';
export function updateFastLbsConfigJson(lambdaName) {
    const projectRoot = getProjectRootOrThrow();
    const filePath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(filePath)) {
        const configContent = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(configContent);
        config.lambdas = config?.lambdas && typeof config.lambdas === 'object' ? config.lambdas : {};
        config.lambdas[lambdaName] = {
            "directory": `lambdas/${lambdaName}`,
        };
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
}