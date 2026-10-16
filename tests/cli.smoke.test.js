import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { nameToKebabCase, toPascalCase, toDocConstName } from '../src/utils/string_utils.js';
import { assertValidLambdaName, assertValidProjectName, assertValidMiddlewareName } from '../src/utils/cli_validation.js';
import { addDocToPathsArray, removeDocFromPaths } from '../src/services/docs/doc_manager.js';
import * as esbuild from 'esbuild';
import { normalizeBuildType, extractUsedDependencies } from '../src/scripts/build/index.js';
import { createBaseContext } from '../src/scripts/new_project/services/create_base_context.js';
import { createBaseDoc } from '../src/scripts/new_project/services/create_base_doc.js';
import { createBaseWrapper } from '../src/scripts/new_project/services/create_base_wrapper.js';
import { createBaseMiddleware } from '../src/scripts/new_project/services/create_base_middleware.js';
import { createValidatorBaseMiddleware } from '../src/scripts/new_project/services/validator_base_middleware.js';
import { createHandlerResponses } from '../src/scripts/new_project/services/create_handler_responses.js';
import { createZodOpenApiUtil } from '../src/scripts/new_project/services/create_zod_openapi_util.js';
import {
    extractLambdaMetadataFromSource,
    syncLambdaFunctionConfig,
} from '../src/services/serverless/lambda_config_sync.js';
import { buildMethodValidationTemplate, createLambda } from '../src/scripts/create_lambda/services/create_lambda.js';
import { createFunction } from '../src/scripts/create_lambda/services/create_function.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'bin', 'fastlbs.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));

let cachedRuntimeModule = null;
async function getGeneratedRuntime() {
    if (cachedRuntimeModule) return cachedRuntimeModule;
    const tempProjName = `temp_runtime_${Date.now()}`;
    const tempProjDir = path.join(process.cwd(), tempProjName);
    try {
        createBaseContext(tempProjName);
        createHandlerResponses(tempProjName);
        createBaseMiddleware(tempProjName);
        createValidatorBaseMiddleware(tempProjName);
        createBaseWrapper(tempProjName);
        createZodOpenApiUtil(tempProjName);

        const entryFile = path.join(tempProjDir, 'runtime_entry.ts');
        fs.writeFileSync(
            entryFile,
            `export * from "./libs/common/context/fastlbsContext";
export * from "./libs/common/utils/handlerErrorResponse.util";
export * from "./libs/common/utils/handlerStandardResponse.util";
export * from "./libs/common/wrappers/handlerResponse.wrapper";
export * from "./libs/common/utils/zodOpenApi.util";
export * from "./libs/common/middlewares/validator.middleware";
`,
            'utf-8'
        );

        const outFile = path.join(tempProjDir, 'runtime_bundle.mjs');
        await esbuild.build({
            entryPoints: [entryFile],
            bundle: true,
            platform: 'node',
            format: 'esm',
            outfile: outFile,
            plugins: [
                {
                    name: 'zod-stub',
                    setup(build) {
                        build.onResolve({ filter: /^zod$/ }, () => ({ path: 'zod', namespace: 'zod-stub' }));
                        build.onLoad({ filter: /.*/, namespace: 'zod-stub' }, () => ({
                            contents: `
                                export const z = {
                                    object: (shape) => ({ _zod: { def: { type: 'object', shape } } }),
                                    string: () => ({ _zod: { def: { type: 'string' } } }),
                                    number: () => ({ _zod: { def: { type: 'number' } } }),
                                    boolean: () => ({ _zod: { def: { type: 'boolean' } } }),
                                    array: (item) => ({ _zod: { def: { type: 'array', item } } }),
                                    infer: () => ({}),
                                    toJSONSchema: (schema) => schema?._jsonSchema || { type: 'object', properties: {} },
                                };
                                export default z;
                            `,
                            loader: 'js',
                        }));
                    },
                },
            ],
        });

        const code = fs.readFileSync(outFile, 'utf-8');
        const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
        cachedRuntimeModule = await import(dataUrl);
        return cachedRuntimeModule;
    } finally {
        fs.rmSync(tempProjDir, { recursive: true, force: true });
    }
}

function runCli(args, options = {}) {
    return spawnSync(process.execPath, [cliEntry, ...args], {
        cwd: repoRoot,
        encoding: 'utf-8',
        ...options,
    });
}

test('CLI prints exact version from package.json', () => {
    const result = runCli(['--version']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), packageJson.version);
});

test('CLI prints help with all registered commands and aliases', () => {
    const result = runCli(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /new|init/);
    assert.match(result.stdout, /lambda|create-lambda/);
    assert.match(result.stdout, /build|compile/);
    assert.match(result.stdout, /start|dev/);
    assert.match(result.stdout, /test|spec/);
    assert.match(result.stdout, /drop|remove/);
    assert.match(result.stdout, /create-middleware|middleware/);
});

test('CLI build help displays selective build type options', () => {
    const result = runCli(['build', '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--type <strategy>/);
    assert.match(result.stdout, /bundle/);
    assert.match(result.stdout, /modular/);
});

test('CLI validates lambda name properly with error code', () => {
    const result = runCli(['lambda', 'invalid name!']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[INVALID_LAMBDA_NAME\]/);
});

test('CLI validates middleware name properly with error code', () => {
    const result = runCli(['create-middleware', 'bad/middleware/name']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[INVALID_MIDDLEWARE_NAME\]/);
});

test('CLI reports PROJECT_ROOT_NOT_FOUND when executed outside a FastLBS project', () => {
    const result = runCli(['build', 'sample', '--type', 'bundle'], { cwd: repoRoot });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[PROJECT_ROOT_NOT_FOUND\]/);
});

test('String utilities transform identifiers correctly', () => {
    assert.equal(nameToKebabCase('MyAwesomeService'), 'my-awesome-service');
    assert.equal(nameToKebabCase('user_payments API'), 'user-payments-api');
    assert.equal(toPascalCase('create-user'), 'CreateUser');
    assert.equal(toDocConstName('greeting-service'), 'GreetingServiceDoc');
    assert.equal(toDocConstName('users'), 'UsersDoc');
});

test('Validation asserts throw FastlbsError on invalid inputs', () => {
    assert.throws(() => assertValidLambdaName(''), { name: 'FastlbsError' });
    assert.throws(() => assertValidLambdaName('has space'), { name: 'FastlbsError' });
    assert.doesNotThrow(() => assertValidLambdaName('valid_lambda-123'));

    assert.throws(() => assertValidProjectName(''), { name: 'FastlbsError' });
    assert.throws(() => assertValidProjectName('invalid/project'), { name: 'FastlbsError' });
    assert.doesNotThrow(() => assertValidProjectName('my-api-service'));

    assert.throws(() => assertValidMiddlewareName(''), { name: 'FastlbsError' });
    assert.throws(() => assertValidMiddlewareName('rate.limit'), { name: 'FastlbsError' });
    assert.doesNotThrow(() => assertValidMiddlewareName('rate-limit'));
});

test('Doc manager can add and remove doc references cleanly', () => {
    const initialIndex = `
const paths: any[] = [
]

export default {
    paths: {
        ...mergePaths(paths)
    }
}
`;
    const updated = addDocToPathsArray(initialIndex, 'GreetingDoc');
    assert.match(updated, /GreetingDoc/);

    const initialWithPaths = `
export default {
    paths: {
        ...GreetingDoc,
        ...OtherDoc
    }
}
`;
    const cleaned = removeDocFromPaths(initialWithPaths, 'GreetingDoc');
    assert.doesNotMatch(cleaned, /GreetingDoc/);
    assert.match(cleaned, /OtherDoc/);
});

test('Build type normalizer maps aliases and rejects invalid types', () => {
    assert.equal(normalizeBuildType('bundle'), 'bundle');
    assert.equal(normalizeBuildType('single'), 'bundle');
    assert.equal(normalizeBuildType('inlined'), 'bundle');
    assert.equal(normalizeBuildType('modular'), 'modular');
    assert.equal(normalizeBuildType('standalone'), 'modular');
    assert.equal(normalizeBuildType('layers'), 'modular');
    assert.equal(normalizeBuildType('unknown'), null);
});

test('extractUsedDependencies filters built-ins, internal aliases and extracts root versions', () => {
    const fakeMetafile = {
        outputs: {
            'dist/greeting/index.js': {
                imports: [
                    { path: 'node:fs', external: true },
                    { path: 'path', external: true },
                    { path: 'zod', external: true },
                    { path: '@aws-sdk/client-s3/commands', external: true },
                    { path: '@my-api/common/wrappers', external: true },
                    { path: './relative/helper.js', external: false },
                ]
            }
        }
    };

    const deps = extractUsedDependencies(fakeMetafile, repoRoot, 'greeting');
    // zod and @aws-sdk/client-s3 should be present, node:fs, path, @my-api and relative ignored
    assert.ok('zod' in deps);
    assert.ok('@aws-sdk/client-s3' in deps);
    assert.ok(!('node:fs' in deps));
    assert.ok(!('path' in deps));
    assert.ok(!('./relative/helper.js' in deps));
});

test('createBaseContext scaffolds valid fastlbsContext.ts file with expected exports', () => {
    const tempProj = 'temp_ctx_test_' + Date.now();
    try {
        createBaseContext(tempProj);
        const generatedPath = path.join(process.cwd(), tempProj, 'libs', 'common', 'context', 'fastlbsContext.ts');
        assert.ok(fs.existsSync(generatedPath));
        const content = fs.readFileSync(generatedPath, 'utf-8');
        assert.match(content, /export class FastlbsEvent/);
        assert.match(content, /export interface DefaultWarmContext/);
        assert.match(content, /export type FastlbsContext/);
        assert.match(content, /getJsonBody/);
        assert.match(content, /getQueryParam/);
        assert.match(content, /getPathParam/);
        assert.match(content, /getHeader/);
    } finally {
        fs.rmSync(path.join(process.cwd(), tempProj), { recursive: true, force: true });
    }
});

test('FastlbsEvent wraps APIGatewayProxyEventV2 and provides typed custom context & helpers', async () => {
    const { FastlbsEvent } = await getGeneratedRuntime();
    const rawEvent = {
        version: "2.0",
        routeKey: "GET /v1/users/{id}",
        rawPath: "/v1/users/42",
        rawQueryString: "active=true&role=admin",
        cookies: ["session=xyz"],
        headers: {
            "x-api-key": "secret-token-123",
            "content-type": "application/json"
        },
        queryStringParameters: { active: "true", role: "admin" },
        pathParameters: { id: "42" },
        requestContext: { http: { method: "GET", path: "/v1/users/42" } },
        body: JSON.stringify({ username: "luis", roles: ["admin"] }),
        isBase64Encoded: false,
    };

    const warmContext = {
        secrets: { DB_PASSWORD: "secretPassword" },
        db: { query: () => "connected" },
        env: { STAGE: "production" }
    };

    const event = new FastlbsEvent(rawEvent, warmContext);

    // Standard APIGatewayProxyEventV2 properties
    assert.equal(event.rawPath, "/v1/users/42");
    assert.equal(event.routeKey, "GET /v1/users/{id}");
    assert.equal(event.isBase64Encoded, false);

    // Strongly-typed custom warm context
    assert.equal(event.custom.secrets.DB_PASSWORD, "secretPassword");
    assert.equal(event.custom.env.STAGE, "production");
    assert.equal(event.custom.db.query(), "connected");

    // Direct assignment access helper
    assert.equal(event.secrets.DB_PASSWORD, "secretPassword");
    assert.equal(event.env.STAGE, "production");
    assert.equal(event.db.query(), "connected");

    // Utility methods
    assert.equal(event.getQueryParam("role"), "admin");
    assert.equal(event.getQueryParam("missing", "defaultVal"), "defaultVal");
    assert.equal(event.getPathParam("id"), "42");
    assert.equal(event.getPathParam("unknown", "100"), "100");
    assert.equal(event.getHeader("X-API-KEY"), "secret-token-123");
    assert.equal(event.getHeader("non-existent"), undefined);

    // JSON Body parser
    const body = event.getJsonBody();
    assert.equal(body.username, "luis");
    assert.deepEqual(body.roles, ["admin"]);

    // Base64 JSON Body parser
    const b64Raw = {
        ...rawEvent,
        body: Buffer.from(JSON.stringify({ encoded: true })).toString("base64"),
        isBase64Encoded: true,
    };
    const b64Event = new FastlbsEvent(b64Raw, warmContext);
    assert.equal(b64Event.getJsonBody().encoded, true);
});

test('Cold-start warm context initializes once and reuses in-memory state on warm invocations', async () => {
    let initInvocations = 0;
    let cachedContext = null;
    let initPromise = null;

    const mockInit = async () => {
        initInvocations++;
        return {
            connectionId: 'conn_' + initInvocations,
            secrets: { apiKey: 'secret_123' },
            db: { isConnected: true }
        };
    };

    const resolveWarmContext = async () => {
        if (cachedContext !== null) {
            return cachedContext;
        }
        if (!initPromise) {
            initPromise = Promise.resolve(mockInit())
                .then((data) => {
                    cachedContext = data;
                    return data;
                })
                .catch((err) => {
                    initPromise = null;
                    throw err;
                });
        }
        return await initPromise;
    };

    // 1st Invocation: Cold Start
    assert.equal(cachedContext, null);
    const warmData1 = await resolveWarmContext();
    assert.equal(initInvocations, 1);
    assert.equal(warmData1.connectionId, 'conn_1');

    // 2nd Invocation: Warm Start (reused memory)
    const warmData2 = await resolveWarmContext();
    assert.equal(initInvocations, 1); // Remains 1, init was NOT called again
    assert.equal(warmData2.connectionId, 'conn_1');

    // 3rd Invocation: Warm Start (reused memory)
    const warmData3 = await resolveWarmContext();
    assert.equal(initInvocations, 1); // Still 1
    assert.equal(warmData3.connectionId, 'conn_1');
});

test('Cold-start init failure allows subsequent invocations to retry initialization', async () => {
    let attempts = 0;
    let cachedContext = null;
    let initPromise = null;

    const flakyInit = async () => {
        attempts++;
        if (attempts === 1) {
            throw new Error('Database connection timeout during cold start');
        }
        return { recovered: true, attempts };
    };

    const resolveWarmContext = async () => {
        if (cachedContext !== null) {
            return cachedContext;
        }
        if (!initPromise) {
            initPromise = Promise.resolve(flakyInit())
                .then((data) => {
                    cachedContext = data;
                    return data;
                })
                .catch((err) => {
                    initPromise = null; // resets promise so it does not get permanently rejected
                    throw err;
                });
        }
        return await initPromise;
    };

    // 1st Attempt: Fails
    await assert.rejects(async () => {
        await resolveWarmContext();
    }, /Database connection timeout/);
    assert.equal(attempts, 1);
    assert.equal(cachedContext, null);

    // 2nd Attempt: Successfully retries and caches
    const recoveredData = await resolveWarmContext();
    assert.equal(attempts, 2);
    assert.equal(recoveredData.recovered, true);

    // 3rd Attempt: Warm cache used
    const warmData = await resolveWarmContext();
    assert.equal(attempts, 2); // Not called again
    assert.equal(warmData.recovered, true);
});

test('createBaseDoc includes both BearerAuth and BasicAuth security schemes by default', () => {
    const tempProj = 'temp_doc_test_' + Date.now();
    try {
        createBaseDoc(tempProj);
        const docIndexPath = path.join(process.cwd(), tempProj, 'lambdas', '__doc__', 'src', 'documents', 'index.ts');
        assert.ok(fs.existsSync(docIndexPath));
        const content = fs.readFileSync(docIndexPath, 'utf-8');
        assert.match(content, /"BearerAuth"\s*:\s*\{[\s\S]*?"scheme"\s*:\s*"bearer"/);
        assert.match(content, /"BasicAuth"\s*:\s*\{[\s\S]*?"scheme"\s*:\s*"basic"/);
    } finally {
        fs.rmSync(path.join(process.cwd(), tempProj), { recursive: true, force: true });
    }
});

test('extractLambdaMetadataFromSource parses both handlerResponse options and @fastlbs JSDoc annotations', () => {
    const sourceWithOptions = `
        /**
         * @fastlbs
         * @summary Overridden by options.doc
         * @tags USERS, ADMIN
         */
        export const handler = handlerResponse<UserData>(
            {
                event: {
                    method: "POST",
                    path: "/v2/users/{id}",
                    cors: false,
                },
                doc: {
                    summary: "Create user by ID",
                    description: "Creates a new user record",
                    response: UserResponseSchema,
                },
            },
            validatorMiddleware(UserBodySchema, ValidationOptions.BODY),
            service
        );
    `;

    const meta1 = extractLambdaMetadataFromSource(sourceWithOptions);
    assert.deepEqual(meta1.events, [
        {
            http: {
                method: 'post',
                path: 'v2/users/{id}',
                cors: false,
            },
        },
    ]);
    assert.equal(meta1.docMeta.summary, 'Create user by ID');
    assert.equal(meta1.docMeta.description, 'Creates a new user record');
    assert.deepEqual(meta1.docMeta.tags, ['USERS', 'ADMIN']);

    const sourceWithJsDocOnly = `
        /**
         * @fastlbs
         * @method PUT
         * @path /v1/items
         * @summary Update item
         * @auth BasicAuth
         */
        export const handler = handlerResponse(service);
    `;

    const meta2 = extractLambdaMetadataFromSource(sourceWithJsDocOnly);
    assert.deepEqual(meta2.events, [
        {
            http: {
                method: 'put',
                path: 'v1/items',
                cors: true,
            },
        },
    ]);
    assert.equal(meta2.docMeta.summary, 'Update item');
    assert.deepEqual(meta2.docMeta.security, ['BasicAuth']);

    const sourceWithScheduleEvent = `
        export const handler = handlerResponse(
            {
                event: {
                    type: "schedule",
                    rate: "rate(10 minutes)",
                },
            },
            service
        );
    `;
    const meta3 = extractLambdaMetadataFromSource(sourceWithScheduleEvent);
    assert.deepEqual(meta3.events, [
        {
            schedule: 'rate(10 minutes)',
        },
    ]);
});

test('syncLambdaFunctionConfig auto-updates serverlessConfig/functions/<lambda>.json and is idempotent', () => {
    const tempProj = path.join(process.cwd(), 'temp_sync_test_' + Date.now());
    try {
        const lambdaSrcDir = path.join(tempProj, 'lambdas', 'orders', 'src');
        fs.mkdirSync(lambdaSrcDir, { recursive: true });
        fs.writeFileSync(
            path.join(lambdaSrcDir, 'index.ts'),
            `
            export const handler = handlerResponse(
                {
                    event: {
                        method: "DELETE",
                        path: "/v1/orders/{orderId}",
                        cors: true,
                    },
                    doc: {
                        summary: "Delete order",
                        tags: ["ORDERS"],
                    },
                },
                service
            );
            `,
            'utf-8'
        );

        // 1st sync writes the file and returns true
        const changed1 = syncLambdaFunctionConfig(tempProj, 'orders');
        assert.equal(changed1, true);

        const fnConfigPath = path.join(tempProj, 'serverlessConfig', 'functions', 'orders.json');
        assert.ok(fs.existsSync(fnConfigPath));
        const parsed = JSON.parse(fs.readFileSync(fnConfigPath, 'utf-8'));
        assert.equal(parsed.orders.handler, 'dist/orders/index.handler');
        assert.deepEqual(parsed.orders.events, [
            {
                http: {
                    method: 'delete',
                    path: 'v1/orders/{orderId}',
                    cors: true,
                },
            },
        ]);
        assert.equal(parsed.orders._docMeta.summary, 'Delete order');

        // 2nd sync with identical source returns false (no redundant write)
        const changed2 = syncLambdaFunctionConfig(tempProj, 'orders');
        assert.equal(changed2, false);
    } finally {
        fs.rmSync(tempProj, { recursive: true, force: true });
    }
});

test('__doc__ auto-generates OpenAPI 3.0 specification from Zod schemas with BearerAuth and BasicAuth', async () => {
    const {
        extractOpenApiFromHandler,
        handlerResponse,
        validatorMiddleware,
        ValidationOptions,
    } = await getGeneratedRuntime();

    // Verify createBaseDoc includes securitySchemes for BearerAuth and BasicAuth
    const tempProjName = `temp_doc_${Date.now()}`;
    const tempProjDir = path.join(process.cwd(), tempProjName);
    try {
        createBaseDoc(tempProjName);
        const docIndexPath = path.join(tempProjDir, 'lambdas', '__doc__', 'src', 'documents', 'index.ts');
        assert.ok(fs.existsSync(docIndexPath), 'Expected documents/index.ts to exist');
        const docIndexContent = fs.readFileSync(docIndexPath, 'utf-8');
        assert.match(docIndexContent, /"BearerAuth"\s*:\s*\{[\s\S]*?"scheme"\s*:\s*"bearer"/);
        assert.match(docIndexContent, /"BasicAuth"\s*:\s*\{[\s\S]*?"scheme"\s*:\s*"basic"/);
    } finally {
        fs.rmSync(tempProjDir, { recursive: true, force: true });
    }

    const mockQuerySchema = {
        _jsonSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional name query parameter',
                    example: 'John Doe',
                },
            },
        },
    };

    const mockBodySchema = {
        _jsonSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    example: 'John Doe',
                },
            },
        },
    };

    const mockGreetingResponse = {
        _jsonSchema: {
            type: 'object',
            properties: {
                greeting: {
                    type: 'string',
                    description: 'Greeting response message',
                    example: 'Hello, John Doe! from Lambda Getgreeting',
                },
            },
        },
    };

    const mockBadRequestError = {
        _jsonSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'Invalid request parameters' },
                error: { type: 'array', example: ['name: Invalid input'] },
            },
        },
    };

    const mockServerError = {
        _jsonSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', example: 'An unexpected error occurred' },
                error: { type: 'string', example: 'Database connection timeout' },
            },
        },
    };

    // 1. GET greeting handler with query parameter
    const getGreetingHandler = handlerResponse(
        {
            event: { method: 'GET', path: 'v1/greeting' },
            doc: {
                summary: 'Basic Getgreeting Lambda function',
                tags: ['GETGREETING'],
                response: mockGreetingResponse,
            },
        },
        validatorMiddleware(mockQuerySchema, ValidationOptions.QUERYPARAMS),
        async () => {}
    );

    // 2. POST greeting handler with request body and error docs
    const postGreetingHandler = handlerResponse(
        {
            event: { method: 'POST', path: 'v1/greeting' },
            doc: {
                summary: 'Basic greeting Lambda function',
                tags: ['GREETING'],
                response: mockGreetingResponse,
                errors: {
                    400: { description: 'Bad Request', schema: mockBadRequestError },
                    500: { description: 'Server Error', schema: mockServerError },
                },
            },
        },
        validatorMiddleware(mockBodySchema, ValidationOptions.BODY),
        async () => {}
    );

    // 3. Authenticated GET users handler
    const getUsersHandler = handlerResponse(
        {
            event: { method: 'GET', path: 'v1/users', authorizer: 'auth' },
            doc: {
                summary: 'Get users (authenticated)',
                response: mockGreetingResponse,
            },
        },
        async () => {}
    );

    const getPaths = extractOpenApiFromHandler('getgreeting', getGreetingHandler);
    const postPaths = extractOpenApiFromHandler('greeting', postGreetingHandler);
    const authPaths = extractOpenApiFromHandler('getUsers', getUsersHandler);

    // Verify GET /v1/greeting
    const greetingGet = getPaths['/v1/greeting']?.get;
    assert.ok(greetingGet);
    assert.equal(greetingGet.summary, 'Basic Getgreeting Lambda function');
    assert.deepEqual(greetingGet.tags, ['GETGREETING']);
    const nameParam = greetingGet.parameters?.find((p) => p.name === 'name' && p.in === 'query');
    assert.ok(nameParam);
    assert.equal(nameParam.example, 'John Doe');

    // Verify POST /v1/greeting
    const greetingPost = postPaths['/v1/greeting']?.post;
    assert.ok(greetingPost);
    assert.equal(greetingPost.summary, 'Basic greeting Lambda function');
    const postBodySchema = greetingPost.requestBody?.content?.['application/json']?.schema;
    assert.ok(postBodySchema);
    assert.equal(postBodySchema.properties?.name?.example, 'John Doe');

    // Verify 400 and 500 error schemas
    assert.equal(
        greetingPost.responses?.['400']?.content?.['application/json']?.schema?.properties?.message?.example,
        'Invalid request parameters'
    );
    assert.equal(
        greetingPost.responses?.['500']?.content?.['application/json']?.schema?.properties?.message?.example,
        'An unexpected error occurred'
    );

    // Verify authenticated endpoint receives security schemes and 401 response automatically
    const usersGet = authPaths['/v1/users']?.get;
    assert.ok(usersGet);
    assert.deepEqual(usersGet.security, [{ BearerAuth: [] }, { BasicAuth: [] }]);
    assert.ok(usersGet.responses?.['401']);
    assert.match(usersGet.responses['401'].description, /Unauthorized/);
});

test('buildMethodValidationTemplate generates method-specific ValidationOptions, .meta examples, and FastlbsContext helpers', () => {
    // 1. GET uses QUERYPARAMS and event.getQueryParam
    const getTpl = buildMethodValidationTemplate('v1/users', 'GET');
    assert.match(getTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
    assert.doesNotMatch(getTpl.middlewareLines, /ValidationOptions\.BODY/);
    assert.match(getTpl.serviceExtraction, /event\.getQueryParam\("name", "World"\)/);
    assert.match(getTpl.schemaDeclaration, /\.meta\(\{\s*example:\s*"John Doe"\s*\}\)/);

    // 2. GET with path param uses PATHPARAMS + QUERYPARAMS
    const getByIdTpl = buildMethodValidationTemplate('v1/users/{userId}', 'GET');
    assert.match(getByIdTpl.middlewareLines, /ValidationOptions\.PATHPARAMS/);
    assert.match(getByIdTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
    assert.match(getByIdTpl.schemaDeclaration, /userId:\s*z\.string\(\)/);

    // 3. POST uses BODY and event.getJsonBody
    const postTpl = buildMethodValidationTemplate('v1/users', 'POST');
    assert.match(postTpl.middlewareLines, /ValidationOptions\.BODY/);
    assert.doesNotMatch(postTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
    assert.match(postTpl.serviceExtraction, /event\.getJsonBody<RequestBody>\(\)/);

    // 4. PUT and PATCH with path param use PATHPARAMS + BODY
    for (const method of ['PUT', 'PATCH']) {
        const updateTpl = buildMethodValidationTemplate('v1/users/{id}', method);
        assert.match(updateTpl.middlewareLines, /ValidationOptions\.PATHPARAMS/);
        assert.match(updateTpl.middlewareLines, /ValidationOptions\.BODY/);
        assert.doesNotMatch(updateTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
        assert.match(updateTpl.serviceExtraction, /event\.getJsonBody<RequestBody>\(\)/);
    }

    // 5. DELETE uses PATHPARAMS and event.getPathParam
    const deleteTpl = buildMethodValidationTemplate('v1/users/{orderId}', 'DELETE');
    assert.match(deleteTpl.middlewareLines, /ValidationOptions\.PATHPARAMS/);
    assert.doesNotMatch(deleteTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
    assert.doesNotMatch(deleteTpl.middlewareLines, /ValidationOptions\.BODY/);
    assert.match(deleteTpl.serviceExtraction, /event\.getPathParam\("orderId", "World"\)/);

    // 6. HEAD and OPTIONS use HEADERS and event.getHeader
    for (const method of ['HEAD', 'OPTIONS']) {
        const headTpl = buildMethodValidationTemplate('v1/health', method);
        assert.match(headTpl.middlewareLines, /ValidationOptions\.HEADERS/);
        assert.doesNotMatch(headTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
        assert.match(headTpl.serviceExtraction, /event\.getHeader\("x-client-name"\)/);
    }

    // 7. Verify modular lambda structure generated by createLambda
    const tempProj = fs.mkdtempSync(path.join(repoRoot, 'temp-modular-test-'));
    try {
        createLambda('greeting', 'v1/greeting', 'POST', { rootDir: tempProj });

        const greetingSrcDir = path.join(tempProj, 'lambdas', 'greeting', 'src');
        const indexContent = fs.readFileSync(path.join(greetingSrcDir, 'index.ts'), 'utf-8');
        const schemasContent = fs.readFileSync(path.join(greetingSrcDir, 'schemas', 'index.ts'), 'utf-8');
        const servicesContent = fs.readFileSync(path.join(greetingSrcDir, 'services', 'index.ts'), 'utf-8');

        // src/index.ts should only contain imports and export const handler = handlerResponse(...)
        assert.match(indexContent, /export const handler = handlerResponse/);
        assert.doesNotMatch(indexContent, /async function service/);
        assert.doesNotMatch(indexContent, /z\.object/);

        // src/schemas/index.ts should contain Zod schemas with .meta({ example }) and error schemas
        assert.match(schemasContent, /export const RequestBodySchema/);
        assert.match(schemasContent, /export const GreetingResponseSchema/);
        assert.match(schemasContent, /export const BadRequestErrorSchema/);
        assert.match(schemasContent, /export const InternalServerErrorSchema/);
        assert.match(schemasContent, /\.meta\(\{\s*example:/);

        // src/services/index.ts should contain export async function service
        assert.match(servicesContent, /export async function service/);
        assert.match(servicesContent, /HandlerStandardResponse/);
    } finally {
        fs.rmSync(tempProj, { recursive: true, force: true });
    }
});

test('handlerAuthorizer, handlerAuxiliary, and handlerResponse pre-execution with event.getAuthUser()', async () => {
    const {
        handlerAuthorizer,
        handlerAuxiliary,
        handlerResponse,
        HandlerStandardResponse,
        HandlerErrorResponse,
    } = await getGeneratedRuntime();

    // 1. Create an Authorizer Lambda (auth)
    const authHandler = handlerAuthorizer({ isPublic: false }, async (event) => {
        const authHeader = event.getHeader('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new HandlerErrorResponse(401, 'Unauthorized', 'Missing token');
        }
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (token === 'invalid') {
            throw new HandlerErrorResponse(403, 'Forbidden', 'Invalid token');
        }
        return {
            id: 'usr_999',
            email: 'admin@fastlbs.dev',
            roles: ['admin', 'editor'],
            token,
        };
    });

    const authPolicy = await authHandler({
        headers: { authorization: 'Bearer valid-jwt' },
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:apiId/dev/GET/v1/users',
    });
    assert.equal(authPolicy.principalId, 'usr_999');
    assert.equal(authPolicy.isAuthorized, true);
    assert.equal(authPolicy.policyDocument.Statement[0].Effect, 'Allow');
    assert.equal(authPolicy.context.id, 'usr_999');
    assert.equal(authPolicy.context.email, 'admin@fastlbs.dev');
    assert.deepEqual(JSON.parse(authPolicy.context.__fastlbsAuth).roles, ['admin', 'editor']);

    // Authorizer throws "Unauthorized" on 401
    await assert.rejects(
        () => authHandler({ headers: {} }),
        /Unauthorized/
    );

    // Authorizer returns Deny policy on 403
    const denyPolicy = await authHandler({
        headers: { authorization: 'Bearer invalid' },
    });
    assert.equal(denyPolicy.isAuthorized, false);
    assert.equal(denyPolicy.policyDocument.Statement[0].Effect, 'Deny');

    // 2. Create an Auxiliary Lambda (auditLog)
    const auditCalls = [];
    const auditHandler = handlerAuxiliary({}, async (event) => {
        const payload = event.getPayload();
        auditCalls.push({
            hasAuthUser: Boolean(event.getAuthUser()),
            headers: payload?.headers,
        });
        return { audited: true };
    });

    const directAuxResult = await auditHandler({ action: 'USER_LOGIN', userId: 'usr_999' });
    assert.deepEqual(directAuxResult, { audited: true });

    // 3. Create an HTTP Lambda (getUsers) that consumes authHandler and auditHandler before running
    const getUsersHandler = handlerResponse(
        {
            isPublic: false,
            event: {
                method: 'GET',
                path: 'v1/users',
                authorizer: 'auth',
            },
            before: [authHandler, auditHandler],
        },
        async (event) => {
            const authUser = event.getAuthUser();
            return new HandlerStandardResponse(200, {
                message: 'Success',
                status: 'success',
                data: {
                    requestedBy: authUser,
                    users: [{ id: 'usr_999', email: authUser?.email }],
                },
            });
        }
    );

    // Case A: Invoked via API Gateway where requestContext.authorizer is already populated
    const apiGwResponse = await getUsersHandler({
        headers: { authorization: 'Bearer valid-jwt' },
        requestContext: {
            authorizer: authPolicy.context,
        },
    });
    assert.equal(apiGwResponse.statusCode, 200);
    const apiGwBody = JSON.parse(apiGwResponse.body);
    assert.equal(apiGwBody.data.requestedBy.id, 'usr_999');
    assert.equal(apiGwBody.data.requestedBy.email, 'admin@fastlbs.dev');
    assert.deepEqual(apiGwBody.data.requestedBy.roles, ['admin', 'editor']);

    // Case B: Invoked directly in local unit test (without requestContext.authorizer) -> before: [authHandler] runs!
    const localTestResponse = await getUsersHandler({
        headers: { authorization: 'Bearer local-test-token' },
    });
    assert.equal(localTestResponse.statusCode, 200);
    const localTestBody = JSON.parse(localTestResponse.body);
    assert.equal(localTestBody.data.requestedBy.id, 'usr_999');
    assert.equal(localTestBody.data.requestedBy.token, 'local-test-token');

    // Case C: Invoked directly in local unit test with missing token -> returns 401 automatically
    const unauthorizedResponse = await getUsersHandler({
        headers: {},
    });
    assert.equal(unauthorizedResponse.statusCode, 401);
});

test('lambda_config_sync extracts and syncs authorizer and non-HTTP auxiliary/authorizer lambdas', () => {
    // 1. HTTP lambda with authorizer inside event block
    const getUsersSource = `
        export const handler = handlerResponse(
            {
                isPublic: false,
                event: {
                    method: "GET",
                    path: "v1/users",
                    cors: true,
                    authorizer: "auth",
                },
                doc: {
                    summary: "Get users list",
                    tags: ["USERS"],
                },
            },
            service
        );
    `;
    const getUsersMeta = extractLambdaMetadataFromSource(getUsersSource, 'getUsers');
    assert.equal(getUsersMeta.lambdaKind, 'http');
    assert.equal(getUsersMeta.events[0].http.authorizer.name, 'auth');
    assert.equal(getUsersMeta.events[0].http.authorizer.type, 'request');
    assert.equal(getUsersMeta.events[0].http.authorizer.identitySource, 'method.request.header.Authorization');
    assert.equal(getUsersMeta.docMeta.authorizer, 'auth');

    // 2. Authorizer lambda has empty events array
    const authSource = `
        export const handler = handlerAuthorizer(
            {
                isPublic: false,
            },
            service
        );
    `;
    const authMeta = extractLambdaMetadataFromSource(authSource, 'auth');
    assert.equal(authMeta.lambdaKind, 'authorizer');
    assert.deepEqual(authMeta.events, []);

    // 3. Auxiliary lambda has empty events array
    const auxSource = `
        export const handler = handlerAuxiliary(
            {
                isPublic: false,
            },
            service
        );
    `;
    const auxMeta = extractLambdaMetadataFromSource(auxSource, 'auditLog');
    assert.equal(auxMeta.lambdaKind, 'auxiliary');
    assert.deepEqual(auxMeta.events, []);
});

test('createLambda and createFunction scaffold authorizer, auxiliary, and authenticated HTTP lambdas', () => {
    const tempProj = fs.mkdtempSync(path.join(repoRoot, 'temp-auth-aux-test-'));
    try {
        // 1. Scaffold Authorizer lambda ("auth")
        createLambda('auth', { kind: 'authorizer', rootDir: tempProj });
        createFunction('auth', 'NONE', 'NONE', { kind: 'authorizer', rootDir: tempProj });

        const authIndex = fs.readFileSync(path.join(tempProj, 'lambdas', 'auth', 'src', 'index.ts'), 'utf-8');
        const authService = fs.readFileSync(path.join(tempProj, 'lambdas', 'auth', 'src', 'services', 'index.ts'), 'utf-8');
        const authFnConfig = JSON.parse(
            fs.readFileSync(path.join(tempProj, 'serverlessConfig', 'functions', 'auth.json'), 'utf-8')
        );
        assert.match(authIndex, /handlerAuthorizer/);
        assert.match(authService, /event\.getHeader\("authorization"\)/);
        assert.deepEqual(authFnConfig.auth.events, []);
        assert.equal(authFnConfig.auth._lambdaKind, 'authorizer');

        // 2. Scaffold Auxiliary lambda ("auditLog")
        createLambda('auditLog', { kind: 'auxiliary', rootDir: tempProj });
        createFunction('auditLog', 'NONE', 'NONE', { kind: 'auxiliary', rootDir: tempProj });

        const auxIndex = fs.readFileSync(path.join(tempProj, 'lambdas', 'auditLog', 'src', 'index.ts'), 'utf-8');
        const auxService = fs.readFileSync(path.join(tempProj, 'lambdas', 'auditLog', 'src', 'services', 'index.ts'), 'utf-8');
        const auxFnConfig = JSON.parse(
            fs.readFileSync(path.join(tempProj, 'serverlessConfig', 'functions', 'auditLog.json'), 'utf-8')
        );
        assert.match(auxIndex, /handlerAuxiliary/);
        assert.match(auxIndex, /ValidationOptions\.PAYLOAD/);
        assert.match(auxService, /event\.getPayload/);
        assert.deepEqual(auxFnConfig['auditLog'].events, []);
        assert.equal(auxFnConfig['auditLog']._lambdaKind, 'auxiliary');

        // 3. Scaffold HTTP lambda ("getUsers") consuming "auth" and "auditLog"
        createLambda('getUsers', {
            kind: 'http',
            pathUrl: 'v1/users',
            method: 'GET',
            authorizer: 'auth',
            before: ['auditLog'],
            rootDir: tempProj,
        });
        createFunction('getUsers', 'v1/users', 'GET', {
            kind: 'http',
            authorizer: 'auth',
            before: ['auditLog'],
            rootDir: tempProj,
        });

        const getUsersIndex = fs.readFileSync(path.join(tempProj, 'lambdas', 'getUsers', 'src', 'index.ts'), 'utf-8');
        const getUsersService = fs.readFileSync(path.join(tempProj, 'lambdas', 'getUsers', 'src', 'services', 'index.ts'), 'utf-8');
        const getUsersFnConfig = JSON.parse(
            fs.readFileSync(path.join(tempProj, 'serverlessConfig', 'functions', 'getUsers.json'), 'utf-8')
        );
        assert.match(getUsersIndex, /authorizer:\s*"auth"/);
        assert.match(getUsersIndex, /before:\s*\[authAuthorizer,\s*auditLogAuxiliary\]/);
        assert.match(getUsersService, /event\.getAuthUser/);
        assert.equal(getUsersFnConfig['getUsers'].events[0].http.authorizer.name, 'auth');
    } finally {
        fs.rmSync(tempProj, { recursive: true, force: true });
    }
});





