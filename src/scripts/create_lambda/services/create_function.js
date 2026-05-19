
import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

export function createFunction(lambdaName, lambdaPath, method) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();

    const functionConfig = {
        [lambdaName]: {
            "handler": `dist/${lambdaName}/index.handler`,
            "events": [
                {
                    "http": {
                        "method": method.toLowerCase(),
                        "path": lambdaPath,
                        "cors": true
                    }
                }
            ]
        }
    }
    const functionsDir = path.join(projectRoot, 'serverlessConfig/functions');
    assertPathInsideProject(projectRoot, functionsDir, 'serverless functions directory');
    fs.mkdirSync(functionsDir, { recursive: true });
    const functionConfigPath = path.join(functionsDir, `${lambdaName}.json`);
    fs.writeFileSync(functionConfigPath, JSON.stringify(functionConfig, null, 2), 'utf-8');
}