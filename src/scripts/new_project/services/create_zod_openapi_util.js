import fs from 'fs';
import path from 'path';

export function createZodOpenApiUtil(projectName) {
    const content =
`// Mark doc generation mode so importing lambda handlers does not trigger eagerInit connections
(globalThis as any).__FASTLBS_DOC_MODE__ = true;

import { z, type ZodType } from "zod";
import { ValidationOptions } from "../middlewares/validator.middleware";

/**
 * Recursively strips "$schema" and normalizes JSON Schema output from Zod v4
 * so it conforms cleanly to OpenAPI 3.0 Schema Object specification.
 */
export function cleanJsonSchemaForOpenApi(schemaObj: any): any {
  if (!schemaObj || typeof schemaObj !== "object") {
    return schemaObj;
  }

  if (Array.isArray(schemaObj)) {
    return schemaObj.map((item) => cleanJsonSchemaForOpenApi(item));
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(schemaObj)) {
    if (key === "$schema") {
      continue;
    }
    cleaned[key] = cleanJsonSchemaForOpenApi(value);
  }
  return cleaned;
}

/**
 * Converts a Zod schema into an OpenAPI 3.0 compatible Schema Object.
 */
export function zodToOpenApiSchema(schema?: ZodType): Record<string, any> | undefined {
  if (!schema) {
    return undefined;
  }

  try {
    if (typeof (z as any).toJSONSchema === "function") {
      const rawJsonSchema = (z as any).toJSONSchema(schema);
      return cleanJsonSchemaForOpenApi(rawJsonSchema);
    }
  } catch {
    // Fallback if schema cannot be converted via z.toJSONSchema
  }

  return { type: "object" };
}

/**
 * Converts an object-based Zod schema into an array of OpenAPI 3.0 Parameter Objects
 * for query, path, or header locations.
 */
export function zodToOpenApiParameters(
  schema: ZodType,
  location: "query" | "path" | "header"
): Array<Record<string, any>> {
  const jsonSchema = zodToOpenApiSchema(schema);
  if (!jsonSchema || jsonSchema.type !== "object" || !jsonSchema.properties) {
    return [];
  }

  const requiredFields = new Set<string>(
    Array.isArray(jsonSchema.required) ? jsonSchema.required : []
  );

  const parameters: Array<Record<string, any>> = [];

  for (const [propName, propSchema] of Object.entries<any>(jsonSchema.properties)) {
    const { description, example, ...restSchema } = propSchema || {};
    parameters.push({
      name: propName,
      in: location,
      required: location === "path" ? true : requiredFields.has(propName),
      ...(description ? { description } : {}),
      ...(example !== undefined ? { example } : {}),
      schema:
        Object.keys(restSchema).length > 0
          ? { ...restSchema, ...(example !== undefined ? { example } : {}) }
          : { type: "string", ...(example !== undefined ? { example } : {}) },
    });
  }

  return parameters;
}

const DEFAULT_ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "Bad Request / Validation Error",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Resource Not Found",
  "409": "Conflict",
  "422": "Unprocessable Entity",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
};

function isZodSchema(value: any): value is ZodType {
  return Boolean(
    value &&
      typeof value === "object" &&
      (typeof value.safeParse === "function" || "_def" in value || "_zod" in value)
  );
}

function buildErrorResponses(
  errorsConfig?: Record<string | number, any>
): Record<string, any> {
  const errorResponses: Record<string, any> = {
    "400": {
      description: "Validation / Bad Request Error",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "Invalid request" },
              error: {
                type: "array",
                items: { type: "string" },
                example: ["field: Required"],
              },
            },
          },
        },
      },
    },
    "500": {
      description: "Internal Server Error",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "An unexpected error occurred" },
              error: { type: "string", example: "Unexpected runtime error" },
            },
          },
        },
      },
    },
  };

  if (!errorsConfig || typeof errorsConfig !== "object") {
    return errorResponses;
  }

  for (const [rawCode, errorEntry] of Object.entries(errorsConfig)) {
    if (!errorEntry) continue;
    const code = String(rawCode);
    const directSchema = isZodSchema(errorEntry) ? errorEntry : errorEntry.schema;
    const openApiErrorSchema = zodToOpenApiSchema(directSchema);
    if (!openApiErrorSchema) continue;

    const customDescription =
      (!isZodSchema(errorEntry) && errorEntry.description) ||
      openApiErrorSchema.description ||
      DEFAULT_ERROR_DESCRIPTIONS[code] ||
      \`Error response (\${code})\`;

    errorResponses[code] = {
      description: customDescription,
      content: {
        "application/json": {
          schema: openApiErrorSchema,
        },
      },
    };
  }

  return errorResponses;
}

function normalizeOpenApiPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  return trimmed.startsWith("/") ? trimmed : \`/\${trimmed}\`;
}

function extractHttpEvents(
  optionsEvent: any,
  functionConfig: any,
  lambdaName: string
): Array<{ method: string; path: string; hasAuthorizer?: boolean }> {
  const httpEvents: Array<{ method: string; path: string; hasAuthorizer?: boolean }> = [];

  const rawEvents = optionsEvent
    ? Array.isArray(optionsEvent)
      ? optionsEvent
      : [optionsEvent]
    : [];

  for (const evt of rawEvents) {
    if (!evt || typeof evt !== "object") continue;
    if (evt.http && typeof evt.http === "object") {
      if (evt.http.method && evt.http.path) {
        httpEvents.push({
          method: String(evt.http.method).toLowerCase(),
          path: normalizeOpenApiPath(String(evt.http.path)),
          hasAuthorizer: Boolean(evt.http.authorizer),
        });
      }
    } else if (
      (!evt.type || evt.type === "http") &&
      evt.method &&
      evt.path
    ) {
      httpEvents.push({
        method: String(evt.method).toLowerCase(),
        path: normalizeOpenApiPath(String(evt.path)),
        hasAuthorizer: Boolean(evt.authorizer),
      });
    }
  }

  if (httpEvents.length > 0) {
    return httpEvents;
  }

  // Fallback to serverlessConfig/functions/<lambdaName>.json
  const fnBlock = functionConfig?.[lambdaName] || functionConfig;
  const slsEvents = Array.isArray(fnBlock?.events) ? fnBlock.events : [];
  for (const evt of slsEvents) {
    if (evt?.http && evt.http.method && evt.http.path) {
      httpEvents.push({
        method: String(evt.http.method).toLowerCase(),
        path: normalizeOpenApiPath(String(evt.http.path)),
        hasAuthorizer: Boolean(evt.http.authorizer),
      });
    }
  }

  return httpEvents;
}

/**
 * Introspects a FastLBS handler (its attached validatorMiddleware Zod schemas,
 * event configuration, and doc options) to automatically build an OpenAPI 3.0 Path item.
 */
export function extractOpenApiFromHandler(
  lambdaName: string,
  handler: any,
  functionConfig?: any,
  manualOverrides?: Record<string, any>
): Record<string, any> {
  const metadata = handler?.__fastlbsMetadata || {};
  const options = metadata.options || {};
  const validators: Array<{ schema: ZodType; option: ValidationOptions }> =
    Array.isArray(metadata.validators) ? metadata.validators : [];

  const fnBlock = functionConfig?.[lambdaName] || functionConfig || {};
  const commentDocMeta = fnBlock._docMeta || {};

  const httpEvents = extractHttpEvents(options.event, functionConfig, lambdaName);
  if (httpEvents.length === 0) {
    return manualOverrides ? { ...manualOverrides } : {};
  }

  const hasAuthorizerConfigured =
    Boolean(options.authorizer) ||
    httpEvents.some((e) => e.hasAuthorizer) ||
    (Array.isArray(options.before) &&
      options.before.some((fn: any) => Boolean(fn?.__fastlbsAuthorizer)));

  const docConfig = {
    ...commentDocMeta,
    ...(options.doc || {}),
  };

  const summary =
    docConfig.summary || \`\${lambdaName} Lambda endpoint\`;
  const description =
    docConfig.description || \`Auto-generated OpenAPI documentation for \${lambdaName}.\`;
  const tags =
    Array.isArray(docConfig.tags) && docConfig.tags.length > 0
      ? docConfig.tags
      : [lambdaName.toUpperCase()];
  const statusCode = String(docConfig.statusCode || 200);

  const parameters: Array<Record<string, any>> = [];
  let requestBody: Record<string, any> | undefined;

  for (const validator of validators) {
    if (!validator || !validator.schema) continue;

    switch (validator.option) {
      case ValidationOptions.BODY: {
        const bodySchema = zodToOpenApiSchema(validator.schema);
        if (bodySchema) {
          requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: bodySchema,
              },
            },
          };
        }
        break;
      }
      case ValidationOptions.QUERYPARAMS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "query"));
        break;
      }
      case ValidationOptions.PATHPARAMS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "path"));
        break;
      }
      case ValidationOptions.HEADERS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "header"));
        break;
      }
    }
  }

  const responseDataSchema = zodToOpenApiSchema(docConfig.response);
  const successResponseSchema: Record<string, any> = {
    type: "object",
    properties: {
      status: { type: "string", example: "success" },
      message: { type: "string", example: "Request successful" },
      ...(responseDataSchema
        ? { data: responseDataSchema }
        : {
            data: {
              type: "object",
              example: { greeting: \`Hello, World! from lambda \${lambdaName}\` },
            },
          }),
    },
    required: ["status", "message"],
  };

  const errorResponses = buildErrorResponses(docConfig.errors);
  if (hasAuthorizerConfigured && !errorResponses["401"]) {
    errorResponses["401"] = {
      description: "Unauthorized — Invalid or missing authentication credentials",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "Unauthorized" },
              error: { type: "string", example: "Invalid or expired token" },
            },
          },
        },
      },
    };
  }

  let securityBlock: Array<Record<string, string[]>> | undefined;
  if (Array.isArray(docConfig.security)) {
    securityBlock = docConfig.security.map((sec: any) =>
      typeof sec === "string" ? { [sec]: [] } : sec
    );
  } else if (hasAuthorizerConfigured) {
    securityBlock = [{ BearerAuth: [] }, { BasicAuth: [] }];
  }

  const pathsResult: Record<string, any> = {};

  for (const { method, path: routePath } of httpEvents) {
    // Ensure any {param} in routePath is documented in path parameters
    const routeParams = [...parameters];
    const pathParamMatches = [...routePath.matchAll(/\\{([^}]+)\\}/g)];
    for (const match of pathParamMatches) {
      const paramName = match[1];
      const alreadyExists = routeParams.some(
        (p) => p.in === "path" && p.name === paramName
      );
      if (!alreadyExists) {
        routeParams.push({
          name: paramName,
          in: "path",
          required: true,
          schema: { type: "string" },
        });
      }
    }

    const operationObject: Record<string, any> = {
      summary,
      description,
      tags,
      ...(securityBlock ? { security: securityBlock } : {}),
      ...(routeParams.length > 0 ? { parameters: routeParams } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [statusCode]: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: successResponseSchema,
            },
          },
        },
        ...errorResponses,
      },
    };

    if (!pathsResult[routePath]) {
      pathsResult[routePath] = {};
    }
    pathsResult[routePath][method] = operationObject;
  }

  if (manualOverrides && typeof manualOverrides === "object") {
    for (const [overridePath, overrideVal] of Object.entries(manualOverrides)) {
      pathsResult[overridePath] = {
        ...(pathsResult[overridePath] || {}),
        ...(overrideVal as Record<string, any>),
      };
    }
  }

  return pathsResult;
}
`;

    const utilsDir = path.join(process.cwd(), `${projectName}/libs/common/utils`);
    fs.mkdirSync(utilsDir, { recursive: true });
    const filePath = path.join(utilsDir, 'zodOpenApi.util.ts');
    fs.writeFileSync(filePath, content.trimStart(), 'utf-8');
}

