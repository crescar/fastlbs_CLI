import fs from 'fs';
import path from 'path';
export function createBaseServerless(projectName) {
    const content = {
        "service": projectName.toUpperCase(),
        "plugins": ["serverless-offline"],
        "provider": {
            "name": "aws",
            "runtime": "nodejs22.x",
            "region": "us-east-1",
            "timeout": 60
        },
        "package": {
            "excludeDevDependencies": true,
            "patterns": [
                "dist/**",
                "node_modules/**",
                "package.json"
            ]
        },
        "custom": {
            "region": "us-east-1",
            "apigwBinary": {
                "types": [
                    "image/jpeg",
                    "image/jpg",
                    "image/png",
                    "application/x-www-form-urlencoded",
                    "multipart/form-data",
                    "application/octet-stream"
                ]
            },
            "serverless-offline": {
                "noPrependStageInUrl": true
            }
        },
        "functions": {
            "__doc__": {
                "handler": "dist/__doc__/index.handlerSwaggerUI",
                "events": [
                    {
                        "http": {
                            "method": "GET",
                            "path": "api/doc",
                            "cors": true
                        }
                    }
                ]
            },
            "__doc__/json": {
                "handler": "dist/__doc__/index.handlerSwaggerJson",
                "events": [
                    {
                        "http": {
                            "method": "GET",
                            "path": "api/doc/json",
                            "cors": true
                        }
                    }
                ]
            },
            "__doc__/static": {
                "handler": "dist/__doc__/index.handlerSwaggerStatic",
                "events": [
                    {
                        "http": {
                            "method": "GET",
                            "path": "api/doc/static",
                            "cors": true
                        }
                    }
                ]
            }
        }
    }
    const filePath = path.join(process.cwd(), `${projectName}/serverlessConfig/basicServerlessConfig.json`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}