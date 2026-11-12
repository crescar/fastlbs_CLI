import fs from 'fs';
import path from 'path';

export function createBaseServerless(projectName) {
    const docPackage = {
        "patterns": [
            "dist/__doc__/**",
            "node_modules/swagger-ui-dist/**"
        ]
    };
    const content = {
        "service": projectName.toUpperCase(),
        "build": {
            "esbuild": false
        },
        "plugins": ["serverless-offline"],
        "provider": {
            "name": "aws",
            "runtime": "nodejs22.x",
            "region": "us-east-1",
            "timeout": 60
        },
        "package": {
            "individually": true,
            "excludeDevDependencies": true,
            "patterns": [
                "!**"
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
                "package": docPackage,
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
                "package": docPackage,
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
                "package": docPackage,
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
    };
    const filePath = path.join(process.cwd(), `${projectName}/serverlessConfig/basicServerlessConfig.json`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

