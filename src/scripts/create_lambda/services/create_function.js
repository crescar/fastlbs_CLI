import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

export function createFunction(lambdaName, lambdaPath, method, options = {}) {
    assertValidLambdaName(lambdaName);
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    const kind = options.kind || 'http';
    const authorizerName = options.authorizer || null;
    const apiGatewayType = options.apiGateway === 'httpApi' ? 'httpApi' : 'http';
    const cleanPath = lambdaPath ? String(lambdaPath).replace(/^\/+/, '') : '';

    const events =
        kind === 'http' && cleanPath && method && cleanPath !== 'NONE' && method !== 'NONE'
            ? [
                  apiGatewayType === 'httpApi'
                      ? {
                            httpApi: {
                                method: method.toLowerCase(),
                                path: `/${cleanPath}`,
                                ...(authorizerName
                                    ? {
                                          authorizer: {
                                              name: authorizerName,
                                          },
                                      }
                                    : {}),
                            },
                        }
                      : {
                            http: {
                                method: method.toLowerCase(),
                                path: cleanPath,
                                cors: true,
                                ...(authorizerName
                                    ? {
                                          authorizer: {
                                              name: authorizerName,
                                              resultTtlInSeconds: 0,
                                              identitySource: 'method.request.header.Authorization',
                                              type: 'request',
                                          },
                                      }
                                    : {}),
                            },
                        },
              ]
            : [];

    const functionConfig = {
        [lambdaName]: {
            handler: `dist/${lambdaName}/index.handler`,
            package: {
                patterns: [`dist/${lambdaName}/**`],
            },
            events,
            ...(kind !== 'http' ? { _lambdaKind: kind } : {}),
        },
    };
    const functionsDir = path.join(projectRoot, 'serverlessConfig/functions');
    assertPathInsideProject(projectRoot, functionsDir, 'serverless functions directory');
    fs.mkdirSync(functionsDir, { recursive: true });
    const functionConfigPath = path.join(functionsDir, `${lambdaName}.json`);
    fs.writeFileSync(functionConfigPath, JSON.stringify(functionConfig, null, 2), 'utf-8');
}