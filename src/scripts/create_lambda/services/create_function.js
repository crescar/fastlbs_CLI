import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

export function createFunction(lambdaName, lambdaPath, method, options = {}) {
    assertValidLambdaName(lambdaName);
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    const kind = options.kind || 'http';
    const authorizerName = options.authorizer || null;

    const events =
        kind === 'http' && lambdaPath && method && lambdaPath !== 'NONE' && method !== 'NONE'
            ? [
                  {
                      http: {
                          method: method.toLowerCase(),
                          path: lambdaPath,
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