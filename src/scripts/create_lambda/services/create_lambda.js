import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

const createFolderStructure = (lambdaName, rootDir = null) => {
    assertValidLambdaName(lambdaName);
    const projectRoot = rootDir || getProjectRootOrThrow();
    const lambdaDir = path.join(projectRoot, 'lambdas', lambdaName);
    const srcDir = path.join(lambdaDir, 'src');
    const schemasDir = path.join(srcDir, 'schemas');
    const servicesDir = path.join(srcDir, 'services');
    const testDir = path.join(lambdaDir, '__tests__');

    assertPathInsideProject(projectRoot, lambdaDir, 'lambda directory');

    fs.mkdirSync(lambdaDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.mkdirSync(servicesDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    return { projectRoot, srcDir, schemasDir, servicesDir, testDir };
};

const getProjectName = (rootDir = null) => {
    const projectRoot = rootDir || getProjectRootOrThrow();
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        return config.service || 'my-fastlbs-project';
    }
    return 'my-fastlbs-project';
};

/**
 * Builds the method-appropriate Zod schema declarations (with .meta({ example })),
 * service extraction code, and validatorMiddleware registrations based on the selected HTTP method and route.
 */
export function buildMethodValidationTemplate(cleanPath, upperMethod) {
    const pathParamNames = [...String(cleanPath).matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const hasPathParams = pathParamNames.length > 0;

    const pathParamsSchemaBlock = hasPathParams
        ? `export const RequestPathParamsSchema = z.object({\n${pathParamNames
              .map(
                  (p) =>
                      `    ${p}: z.string().optional().describe("Path parameter ${p}").meta({ example: "123" }),`
              )
              .join('\n')}\n});\n\n`
        : '';

    switch (upperMethod) {
        case 'POST':
        case 'PUT':
        case 'PATCH': {
            const schemaDeclaration = `${pathParamsSchemaBlock}export const RequestBodySchema = z.object({
    name: z
        .string()
        .optional()
        .describe("Payload name for ${upperMethod} request")
        .meta({ example: "John Doe" }),
});

export type RequestBody = z.infer<typeof RequestBodySchema>;`;

            const serviceExtraction = `    const body = event.getJsonBody<RequestBody>();
    const name = body?.name || "World";`;

            const middlewareLines = [
                ...(hasPathParams
                    ? ['    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),']
                    : []),
                '    validatorMiddleware(RequestBodySchema, ValidationOptions.BODY),',
            ].join('\n');

            const schemaImports = [
                ...(hasPathParams ? ['RequestPathParamsSchema'] : []),
                'RequestBodySchema',
            ];
            const serviceTypeImports = ['RequestBody'];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'DELETE': {
            const paramsList = hasPathParams ? pathParamNames : ['id'];
            const firstParam = paramsList[0];
            const schemaDeclaration = `export const RequestPathParamsSchema = z.object({
${paramsList
    .map(
        (p) =>
            `    ${p}: z.string().optional().describe("Identifier ${p} of resource to delete").meta({ example: "123" }),`
    )
    .join('\n')}
});`;

            const serviceExtraction = `    const name = event.getPathParam("${firstParam}", "World");`;
            const middlewareLines = `    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),`;
            const schemaImports = ['RequestPathParamsSchema'];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'HEAD':
        case 'OPTIONS': {
            const schemaDeclaration = `export const RequestHeadersSchema = z.object({
    "x-client-name": z
        .string()
        .optional()
        .describe("Optional client identifier header")
        .meta({ example: "fastlbs-web-client" }),
});`;

            const serviceExtraction = `    const name = event.getHeader("x-client-name") || "World";`;
            const middlewareLines = `    validatorMiddleware(RequestHeadersSchema, ValidationOptions.HEADERS),`;
            const schemaImports = ['RequestHeadersSchema'];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'GET':
        default: {
            const schemaDeclaration = `${pathParamsSchemaBlock}export const RequestQuerySchema = z.object({
    name: z
        .string()
        .optional()
        .describe("Optional name query parameter")
        .meta({ example: "John Doe" }),
});`;

            const serviceExtraction = `    const name = event.getQueryParam("name", "World");`;
            const middlewareLines = [
                ...(hasPathParams
                    ? ['    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),']
                    : []),
                '    validatorMiddleware(RequestQuerySchema, ValidationOptions.QUERYPARAMS),',
            ].join('\n');
            const schemaImports = [
                ...(hasPathParams ? ['RequestPathParamsSchema'] : []),
                'RequestQuerySchema',
            ];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }
    }
}

const generateHttpLambdaFiles = (
    { projectRoot, srcDir, schemasDir, servicesDir, testDir },
    lambdaName,
    cleanPath,
    upperMethod,
    options = {}
) => {
    const projectName = getProjectName(projectRoot);
    const authorizerName = options.authorizer || null;
    const beforeAuxList = Array.isArray(options.before)
        ? options.before
        : options.beforeAux
        ? [options.beforeAux]
        : [];

    const {
        schemaDeclaration,
        serviceExtraction,
        middlewareLines,
        schemaImports,
        serviceTypeImports,
    } = buildMethodValidationTemplate(cleanPath, upperMethod);

    const schemasContent =
`import { z } from "zod";

// 1. Request Validation Schemas (use .meta({ example }) to populate Swagger UI examples)
${schemaDeclaration}

// 2. Success Response Schema (200)
export const GreetingResponseSchema = z.object({
    greeting: z
        .string()
        .describe("Greeting response message")
        .meta({ example: "Hello, John Doe! from Lambda ${lambdaName}" }),${
        authorizerName
            ? `\n    authenticatedUser: z
        .object({
            id: z.string().optional().meta({ example: "usr_123" }),
            email: z.string().optional().meta({ example: "user@fastlbs.dev" }),
            roles: z.array(z.string()).optional().meta({ example: ["admin"] }),
        })
        .optional()
        .describe("User information injected by the ${authorizerName} Authorizer Lambda"),`
            : ''
    }
});

export type GreetingData = z.infer<typeof GreetingResponseSchema>;

// 3. Error Response Schemas (for Swagger/OpenAPI error documentation)
export const BadRequestErrorSchema = z.object({
    message: z
        .string()
        .describe("Validation or bad request summary")
        .meta({ example: "Invalid request parameters" }),
    error: z
        .array(z.string())
        .describe("Detailed validation issues")
        .meta({ example: ["name: Invalid input"] }),
});

export const InternalServerErrorSchema = z.object({
    message: z
        .string()
        .describe("Unexpected server error message")
        .meta({ example: "An unexpected error occurred" }),
    error: z
        .string()
        .describe("Technical error detail")
        .meta({ example: "Database connection timeout" }),
});
`;
    fs.writeFileSync(path.join(schemasDir, 'index.ts'), schemasContent, 'utf-8');

    const schemaTypesList = ['GreetingData', ...serviceTypeImports].join(', ');
    const authExtractionLine = authorizerName
        ? `\n    // User data automatically resolved by the "${authorizerName}" Authorizer Lambda:\n    const authenticatedUser = event.getAuthUser();\n`
        : '';
    const authDataProp = authorizerName ? `\n            authenticatedUser,` : '';

    const servicesContent =
`import { HandlerStandardResponse } from "@${projectName}/common/utils/handlerStandardResponse.util";
import { HandlerErrorResponse } from "@${projectName}/common/utils/handlerErrorResponse.util";
import type { FastlbsContext, DefaultWarmContext } from "@${projectName}/common/context/fastlbsContext";
import type { Context } from "aws-lambda";
import type { ${schemaTypesList} } from "../schemas";

// Optional: define your strongly-typed warm context (secrets, db, env, etc.)
// export interface MyWarmContext extends DefaultWarmContext {
//     db?: any;
//     secrets?: { apiKey: string };
// }

// Optional: cold-start initializer executed once during container boot
// export const init = async (): Promise<MyWarmContext> => {
//     return {
//         secrets: { apiKey: "secret_value" },
//     };
// };

export async function service(
    event: FastlbsContext,
    _context: Context
): Promise<HandlerStandardResponse<GreetingData>> {
${serviceExtraction}${authExtractionLine}
    // Example: throw a controlled HTTP error (documented in doc.errors)
    // if (name === "invalid") {
    //     throw new HandlerErrorResponse(400, "Invalid request parameters", ["name cannot be 'invalid'"]);
    // }

    return new HandlerStandardResponse<GreetingData>(200, {
        message: "Request successful",
        status: "success",
        data: {
            greeting: \`Hello, \${name}! from Lambda ${lambdaName}\`,${authDataProp}
        },
    });
}
`;
    fs.writeFileSync(path.join(servicesDir, 'index.ts'), servicesContent, 'utf-8');

    const importedSchemas = [
        ...schemaImports,
        'GreetingResponseSchema',
        'BadRequestErrorSchema',
        'InternalServerErrorSchema',
    ].join(',\n    ');

    const preImports = [];
    const beforeHandlers = [];
    const toIdentifier = (str) =>
        String(str).replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());

    if (
        authorizerName &&
        fs.existsSync(path.join(projectRoot, 'lambdas', authorizerName, 'src', 'index.ts'))
    ) {
        const authId = `${toIdentifier(authorizerName)}Authorizer`;
        preImports.push(
            `import { handler as ${authId} } from "../../${authorizerName}/src/index";`
        );
        beforeHandlers.push(authId);
    }

    for (const beforeAuxName of beforeAuxList) {
        if (
            beforeAuxName &&
            fs.existsSync(path.join(projectRoot, 'lambdas', beforeAuxName, 'src', 'index.ts'))
        ) {
            const auxId = `${toIdentifier(beforeAuxName)}Auxiliary`;
            preImports.push(
                `import { handler as ${auxId} } from "../../${beforeAuxName}/src/index";`
            );
            beforeHandlers.push(auxId);
        }
    }

    const preImportsBlock = preImports.length > 0 ? `\n${preImports.join('\n')}` : '';
    const authorizerEventLine = authorizerName ? `\n            authorizer: "${authorizerName}",` : '';
    const beforeConfigBlock =
        beforeHandlers.length > 0 ? `\n        before: [${beforeHandlers.join(', ')}],` : '';

    const indexContent =
`import {
    handlerResponse
} from "@${projectName}/common/wrappers/handlerResponse.wrapper";
import {
    validatorMiddleware,
    ValidationOptions,
} from "@${projectName}/common/middlewares/validator.middleware";
import {
    ${importedSchemas},
} from "./schemas";
import { service } from "./services";${preImportsBlock}

export const handler = handlerResponse(
    {
        event: {
            method: "${upperMethod}",
            path: "${cleanPath}",
            cors: true,${authorizerEventLine}
        },${beforeConfigBlock}
        doc: {
            summary: "Basic ${lambdaName} Lambda function",
            description: "This is a basic Lambda function created for ${lambdaName}.",
            tags: ["${lambdaName.toUpperCase()}"],
            response: GreetingResponseSchema,
            errors: {
                400: {
                    description: "Bad Request / Validation Error",
                    schema: BadRequestErrorSchema,
                },
                500: {
                    description: "Internal Server Error",
                    schema: InternalServerErrorSchema,
                },
            },
        },
    },
${middlewareLines}
    service
);
`;
    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent, 'utf-8');

    const indexTestContent =
`import { handler } from "../src/index";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

describe("${lambdaName} Lambda", () => {
    it("should return a successful greeting response", async () => {
        const mockEvent = {} as any;
        const mockContext = {} as any;
        const response = await handler(mockEvent, mockContext);
        if (typeof response === "string") {
            throw new Error("Expected structured API Gateway response");
        }
        const structuredResponse = response as APIGatewayProxyStructuredResultV2;
        expect(structuredResponse.statusCode).toBe(200);
        expect(structuredResponse.body).toBeDefined();
        const responseBody = JSON.parse(structuredResponse.body ?? "{}");
        expect(responseBody).toHaveProperty("message", "Request successful");
        expect(responseBody).toHaveProperty("status", "success");
        expect(responseBody).toHaveProperty("data");
        expect(responseBody.data).toHaveProperty("greeting", "Hello, World! from Lambda ${lambdaName}");
    });
});
`;
    fs.writeFileSync(path.join(testDir, 'index.spec.ts'), indexTestContent, 'utf-8');
};

const generateAuthorizerLambdaFiles = (
    { projectRoot, srcDir, schemasDir, servicesDir, testDir },
    lambdaName
) => {
    const projectName = getProjectName(projectRoot);

    const schemasContent =
`import { z } from "zod";

// 1. Authenticated User Context Schema returned by this Authorizer Lambda
// Any HTTP Lambda that consumes "${lambdaName}" will receive this object via event.auth / event.getAuthUser()
export const AuthUserSchema = z.object({
    id: z
        .string()
        .describe("Authenticated user identifier")
        .meta({ example: "usr_123" }),
    email: z
        .string()
        .email()
        .describe("Authenticated user email")
        .meta({ example: "user@fastlbs.dev" }),
    roles: z
        .array(z.string())
        .describe("Assigned user roles")
        .meta({ example: ["admin", "user"] }),
});

export type AuthUserData = z.infer<typeof AuthUserSchema>;
`;
    fs.writeFileSync(path.join(schemasDir, 'index.ts'), schemasContent, 'utf-8');

    const servicesContent =
`import { HandlerErrorResponse } from "@${projectName}/common/utils/handlerErrorResponse.util";
import type { FastlbsContext } from "@${projectName}/common/context/fastlbsContext";
import type { Context } from "aws-lambda";
import type { AuthUserData } from "../schemas";

export async function service(
    event: FastlbsContext,
    _context: Context
): Promise<AuthUserData> {
    const authHeader = event.getHeader("authorization") || "Bearer demo-token";

    if (!authHeader || authHeader === "Unauthorized" || authHeader === "Bearer invalid") {
        throw new HandlerErrorResponse(401, "Unauthorized");
    }

    // Return the authenticated user information.
    // Dependent HTTP Lambdas (e.g. getUsers) automatically receive this in event.getAuthUser<AuthUserData>()
    return {
        id: "usr_123",
        email: "user@fastlbs.dev",
        roles: ["admin"],
    };
}
`;
    fs.writeFileSync(path.join(servicesDir, 'index.ts'), servicesContent, 'utf-8');

    const indexContent =
`import {
    handlerAuthorizer
} from "@${projectName}/common/wrappers/handlerResponse.wrapper";
import type { AuthUserData } from "./schemas";
import { service } from "./services";

export const handler = handlerAuthorizer<AuthUserData>(service);
`;
    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent, 'utf-8');

    const testContent =
`import { handler } from "../src/index";

describe("${lambdaName} Authorizer Lambda", () => {
    it("should authorize valid requests and return user context", async () => {
        const mockEvent = {
            headers: {
                authorization: "Bearer valid-token",
            },
        } as any;
        const mockContext = {} as any;
        const policy = await handler(mockEvent, mockContext);
        expect(policy.isAuthorized).toBe(true);
        expect(policy.principalId).toBe("usr_123");
        expect(policy.user).toEqual({
            id: "usr_123",
            email: "user@fastlbs.dev",
            roles: ["admin"],
        });
    });

    it("should reject invalid authorization tokens", async () => {
        const mockEvent = {
            headers: {
                authorization: "Bearer invalid",
            },
        } as any;
        const mockContext = {} as any;
        await expect(handler(mockEvent, mockContext)).rejects.toThrow("Unauthorized");
    });
});
`;
    fs.writeFileSync(path.join(testDir, 'index.spec.ts'), testContent, 'utf-8');
};

const generateAuxiliaryLambdaFiles = (
    { projectRoot, srcDir, schemasDir, servicesDir, testDir },
    lambdaName
) => {
    const projectName = getProjectName(projectRoot);

    const schemasContent =
`import { z } from "zod";

// 1. Input Payload Schema for this General-Purpose / Auxiliary Lambda
export const AuxiliaryPayloadSchema = z.object({
    action: z
        .string()
        .optional()
        .describe("Action or operation to execute")
        .meta({ example: "enrich" }),
});

export type AuxiliaryPayload = z.infer<typeof AuxiliaryPayloadSchema>;

// 2. Output Result Schema returned by this Auxiliary Lambda
export const AuxiliaryResultSchema = z.object({
    processedBy: z
        .string()
        .describe("Name of the auxiliary lambda")
        .meta({ example: "${lambdaName}" }),
    action: z
        .string()
        .describe("Processed action")
        .meta({ example: "enrich" }),
});

export type AuxiliaryResult = z.infer<typeof AuxiliaryResultSchema>;
`;
    fs.writeFileSync(path.join(schemasDir, 'index.ts'), schemasContent, 'utf-8');

    const servicesContent =
`import type { FastlbsContext } from "@${projectName}/common/context/fastlbsContext";
import type { Context } from "aws-lambda";
import type { AuxiliaryPayload, AuxiliaryResult } from "../schemas";

export async function service(
    event: FastlbsContext,
    _context: Context
): Promise<AuxiliaryResult> {
    const payload = event.getPayload<AuxiliaryPayload>();
    const action = payload?.action || "default";

    return {
        processedBy: "${lambdaName}",
        action,
    };
}
`;
    fs.writeFileSync(path.join(servicesDir, 'index.ts'), servicesContent, 'utf-8');

    const indexContent =
`import {
    handlerAuxiliary
} from "@${projectName}/common/wrappers/handlerResponse.wrapper";
import {
    validatorMiddleware,
    ValidationOptions,
} from "@${projectName}/common/middlewares/validator.middleware";
import {
    AuxiliaryPayloadSchema,
    type AuxiliaryResult,
} from "./schemas";
import { service } from "./services";

export const handler = handlerAuxiliary<AuxiliaryResult>(
    validatorMiddleware(AuxiliaryPayloadSchema, ValidationOptions.PAYLOAD),
    service
);
`;
    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent, 'utf-8');

    const testContent =
`import { handler } from "../src/index";

describe("${lambdaName} Auxiliary Lambda", () => {
    it("should process payload and return structured result", async () => {
        const mockEvent = { action: "enrich" };
        const mockContext = {} as any;
        const result = await handler(mockEvent, mockContext);
        expect(result).toEqual({
            processedBy: "${lambdaName}",
            action: "enrich",
        });
    });
});
`;
    fs.writeFileSync(path.join(testDir, 'index.spec.ts'), testContent, 'utf-8');
};

export const createLambda = (
    lambdaName,
    lambdaPath = `v1/${lambdaName}`,
    method = 'get',
    options = {}
) => {
    let resolvedOptions = options || {};
    let resolvedPath = lambdaPath;
    let resolvedMethod = method;
    if (lambdaPath && typeof lambdaPath === 'object') {
        resolvedOptions = lambdaPath;
        resolvedPath = resolvedOptions.pathUrl || `v1/${lambdaName}`;
        resolvedMethod = resolvedOptions.method || 'get';
    }

    const folders = createFolderStructure(lambdaName, resolvedOptions.rootDir || null);
    const kind = resolvedOptions.kind || 'http';

    if (kind === 'authorizer') {
        generateAuthorizerLambdaFiles(folders, lambdaName);
        return;
    }

    if (kind === 'auxiliary') {
        generateAuxiliaryLambdaFiles(folders, lambdaName);
        return;
    }

    const cleanPath = String(resolvedPath || `v1/${lambdaName}`).replace(/^\/+/, '');
    const upperMethod = String(resolvedMethod || 'get').toUpperCase();
    generateHttpLambdaFiles(folders, lambdaName, cleanPath, upperMethod, resolvedOptions);
};