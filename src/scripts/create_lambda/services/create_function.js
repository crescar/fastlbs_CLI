
import fs from 'fs';
import path from 'path';

export function createFunction(lambdaName, lambdaPath, method) {
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
    const functionsDir = path.join(process.cwd(), 'serverlessConfig/functions');
    fs.mkdirSync(functionsDir, { recursive: true });
    const functionConfigPath = path.join(functionsDir, `${lambdaName}.json`);
    fs.writeFileSync(functionConfigPath, JSON.stringify(functionConfig, null, 2), 'utf-8');
}