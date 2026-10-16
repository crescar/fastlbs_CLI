import fs from 'fs';
import path from 'path';

export function createBaseWrapper(projectName) {
    const wrapperContent =
`try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // .env is optional in AWS Lambda runtime
}
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import type { ZodType } from "zod";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import { HandlerStandardResponse } from "../utils/handlerStandardResponse.util";
import {
  FastlbsEvent,
  type FastlbsContext,
  type DefaultWarmContext,
  type DefaultAuthUser,
} from "../context/fastlbsContext";

export type WarmInitializer<TCustom = Record<string, unknown>> = () => Promise<TCustom> | TCustom;

export type HttpMethod =
  | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"
  | "get" | "post" | "put" | "delete" | "patch" | "head" | "options";

export interface AuthorizerEventConfig {
  name: string;
  resultTtlInSeconds?: number;
  identitySource?: string;
  type?: "token" | "request";
}

export interface HttpEventConfig {
  type?: "http";
  method: HttpMethod;
  path: string;
  cors?: boolean;
  /**
   * Name of the Authorizer Lambda (e.g. "auth"), full Serverless authorizer config,
   * or direct reference to a FastlbsAuthorizerHandler.
   */
  authorizer?: string | AuthorizerEventConfig | FastlbsAuthorizerHandler<any, any>;
}

export interface ScheduleEventConfig {
  type: "schedule";
  rate: string | string[];
  enabled?: boolean;
}

export interface SqsEventConfig {
  type: "sqs";
  arn: string;
  batchSize?: number;
}

export interface S3EventConfig {
  type: "s3";
  bucket: string;
  event?: string;
}

export type LambdaEventConfig =
  | HttpEventConfig
  | ScheduleEventConfig
  | SqsEventConfig
  | S3EventConfig
  | Record<string, unknown>;

export interface HandlerDocErrorConfig {
  description?: string;
  schema: ZodType;
}

export interface HandlerDocConfig {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<"BearerAuth" | "BasicAuth" | Record<string, string[]>>;
  response?: ZodType;
  statusCode?: number;
  /**
   * Custom error responses by HTTP status code (e.g. 400, 401, 404, 500)
   * using a Zod schema or { description, schema }.
   */
  errors?: Record<number | string, ZodType | HandlerDocErrorConfig>;
}

export interface HandlerOptions<
  TCustom = Record<string, unknown>,
  TAuth = DefaultAuthUser
> {
  /**
   * Async or sync initializer executed on Cold Start.
   * Return value is cached in container memory and injected into FastlbsContext
   * for all subsequent warm invocations.
   */
  init?: WarmInitializer<TCustom>;

  /**
   * If true, starts initialization immediately when handlerResponse is evaluated
   * during container initialization.
   */
  eagerInit?: boolean;

  /**
   * Serverless event definition(s) automatically synchronized to
   * serverlessConfig/functions/<lambda>.json and serverless.yml.
   */
  event?: LambdaEventConfig | LambdaEventConfig[];

  /**
   * Optional Authorizer Lambda name or handler to authenticate the request
   * and populate \`event.auth\` / \`event.getAuthUser()\` before executing the service.
   */
  authorizer?: string | AuthorizerEventConfig | FastlbsAuthorizerHandler<TAuth, any>;

  /**
   * Optional list of Auxiliary or Authorizer Lambdas to execute before this Lambda.
   */
  before?: Array<FastlbsAuthorizerHandler<any, any> | FastlbsAuxiliaryHandler<any, any>>;

  /**
   * OpenAPI / Swagger documentation metadata and response Zod schema.
   */
  doc?: HandlerDocConfig;
}

export type HandlerCallback<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = (
  event: FastlbsContext<TCustom, TAuth>,
  context: Context
) => Promise<HandlerStandardResponse<T>>;

export type AuthorizerCallback<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext
> = (
  event: FastlbsContext<TCustom>,
  context: Context
) => Promise<TUser | HandlerStandardResponse<TUser>>;

export type AuxiliaryCallback<
  TOutput = unknown,
  TCustom = DefaultWarmContext
> = (
  event: FastlbsContext<TCustom>,
  context: Context
) => Promise<TOutput | HandlerStandardResponse<TOutput>>;

export type MiddlewareNext<T = any> = () => Promise<HandlerStandardResponse<T>>;

export type HandlerMiddleware<
  T = any,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = (
  event: FastlbsContext<TCustom, TAuth>,
  context: Context,
  next: MiddlewareNext<T>
) => Promise<HandlerStandardResponse<T>>;

export interface AuthorizerPolicyResponse<TUser = DefaultAuthUser> {
  principalId: string;
  isAuthorized: boolean;
  policyDocument: {
    Version: string;
    Statement: Array<{
      Action: string;
      Effect: "Allow" | "Deny";
      Resource: string;
    }>;
  };
  context: Record<string, string | number | boolean>;
  user?: TUser;
}

export type FastlbsLambdaHandler<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = ((
  event: APIGatewayProxyEventV2,
  context: Context
) => Promise<APIGatewayProxyResultV2>) & {
  __fastlbsMetadata?: {
    kind: "http";
    options: HandlerOptions<TCustom, TAuth>;
    validators: Array<{ schema: ZodType; option: string }>;
  };
};

export type FastlbsAuthorizerHandler<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext
> = ((
  event: APIGatewayProxyEventV2,
  context: Context
) => Promise<AuthorizerPolicyResponse<TUser>>) & {
  __fastlbsAuthorizer: true;
  resolveUser: (event: APIGatewayProxyEventV2, context: Context) => Promise<TUser>;
  __fastlbsMetadata?: {
    kind: "authorizer";
    options: HandlerOptions<TCustom>;
    validators: Array<{ schema: ZodType; option: string }>;
  };
};

export type FastlbsAuxiliaryHandler<
  TOutput = unknown,
  TCustom = DefaultWarmContext
> = ((
  event: any,
  context: Context
) => Promise<TOutput>) & {
  __fastlbsAuxiliary: true;
  __fastlbsMetadata?: {
    kind: "auxiliary";
    options: HandlerOptions<TCustom>;
    validators: Array<{ schema: ZodType; option: string }>;
  };
};

function isOptionsArg(firstArg: unknown): boolean {
  return (
    firstArg !== null &&
    typeof firstArg === "object" &&
    !Array.isArray(firstArg) &&
    typeof firstArg !== "function"
  );
}

function createWarmContextResolver<TCustom>(options: HandlerOptions<TCustom, any>) {
  let cachedWarmContext: TCustom | null = null;
  let initPromise: Promise<TCustom> | null = null;

  const resolveWarmContext = async (): Promise<TCustom> => {
    if (cachedWarmContext !== null) {
      return cachedWarmContext;
    }

    if (!options.init) {
      cachedWarmContext = {} as TCustom;
      return cachedWarmContext;
    }

    if (!initPromise) {
      initPromise = Promise.resolve(options.init())
        .then((data) => {
          cachedWarmContext = data;
          return data;
        })
        .catch((error) => {
          initPromise = null;
          throw error;
        });
    }

    return await initPromise;
  };

  if (
    options.eagerInit &&
    options.init &&
    !(globalThis as any).__FASTLBS_DOC_MODE__
  ) {
    resolveWarmContext().catch((err) => {
      console.error("[FastLBS] Eager cold-start initialization failed:", err);
    });
  }

  return resolveWarmContext;
}

function unwrapStandardResponse<TData>(result: any): TData {
  if (result instanceof HandlerStandardResponse) {
    return result.responseBody?.data as TData;
  }
  return result as TData;
}

export function handlerAuthorizer<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext
>(
  options: HandlerOptions<TCustom>,
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom>[],
    callback: AuthorizerCallback<TUser, TCustom>
  ]
): FastlbsAuthorizerHandler<TUser, TCustom>;

export function handlerAuthorizer<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext
>(
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom>[],
    callback: AuthorizerCallback<TUser, TCustom>
  ]
): FastlbsAuthorizerHandler<TUser, TCustom>;

export function handlerAuthorizer<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext
>(...args: any[]): FastlbsAuthorizerHandler<TUser, TCustom> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom> = hasOpts ? args[0] : {};
  const callback: AuthorizerCallback<TUser, TCustom> = args[args.length - 1];
  const middlewares: HandlerMiddleware<any, TCustom>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastlbsValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);

  const resolveUser = async (
    rawEvent: APIGatewayProxyEventV2,
    context: Context
  ): Promise<TUser> => {
    const warmContext = await resolveWarmContext();
    const event = new FastlbsEvent<TCustom>(rawEvent, warmContext) as FastlbsContext<TCustom>;

    let currentIndex = -1;
    const dispatch = async (index: number): Promise<any> => {
      if (index <= currentIndex) {
        throw new HandlerErrorResponse(500, "next() called multiple times");
      }
      currentIndex = index;
      const middleware = middlewares[index];
      if (middleware) {
        return middleware(event, context, () => dispatch(index + 1));
      }
      const rawResult = await callback(event, context);
      if (rawResult instanceof HandlerStandardResponse) {
        return rawResult;
      }
      return new HandlerStandardResponse(200, {
        status: "success",
        message: "Authorized",
        data: rawResult,
      });
    };

    const result = await dispatch(0);
    return unwrapStandardResponse<TUser>(result);
  };

  const wrappedAuthorizer: FastlbsAuthorizerHandler<TUser, TCustom> = Object.assign(
    async (
      rawEvent: APIGatewayProxyEventV2,
      context: Context
    ): Promise<AuthorizerPolicyResponse<TUser>> => {
      try {
        const userData = await resolveUser(rawEvent, context);
        const primitiveContext: Record<string, string | number | boolean> = {};

        if (userData && typeof userData === "object") {
          for (const [k, v] of Object.entries(userData as Record<string, unknown>)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              primitiveContext[k] = v;
            } else if (v !== undefined) {
              primitiveContext[k] = JSON.stringify(v);
            }
          }
        }

        primitiveContext.__fastlbsAuth = JSON.stringify(userData ?? {});

        const principalId = String(
          (userData as any)?.id ||
            (userData as any)?.userId ||
            (userData as any)?.sub ||
            (userData as any)?.email ||
            "authenticated-user"
        );

        return {
          principalId,
          isAuthorized: true,
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Action: "execute-api:Invoke",
                Effect: "Allow",
                Resource:
                  (rawEvent as any)?.methodArn ||
                  (rawEvent as any)?.routeArn ||
                  "*",
              },
            ],
          },
          context: primitiveContext,
          user: userData,
        };
      } catch (error) {
        if (error instanceof HandlerErrorResponse && error.statusCode === 403) {
          return {
            principalId: "unauthorized",
            isAuthorized: false,
            policyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Action: "execute-api:Invoke",
                  Effect: "Deny",
                  Resource:
                    (rawEvent as any)?.methodArn ||
                    (rawEvent as any)?.routeArn ||
                    "*",
                },
              ],
            },
            context: {
              errorMessage: error.message || "Forbidden",
            },
          };
        }
        // Standard AWS API Gateway Custom Authorizer 401 signal
        throw new Error("Unauthorized");
      }
    },
    {
      __fastlbsAuthorizer: true as const,
      resolveUser,
      __fastlbsMetadata: {
        kind: "authorizer" as const,
        options,
        validators,
      },
    }
  );

  return wrappedAuthorizer;
}

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext
>(
  options: HandlerOptions<TCustom>,
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom>[],
    callback: AuxiliaryCallback<TOutput, TCustom>
  ]
): FastlbsAuxiliaryHandler<TOutput, TCustom>;

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext
>(
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom>[],
    callback: AuxiliaryCallback<TOutput, TCustom>
  ]
): FastlbsAuxiliaryHandler<TOutput, TCustom>;

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext
>(...args: any[]): FastlbsAuxiliaryHandler<TOutput, TCustom> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom> = hasOpts ? args[0] : {};
  const callback: AuxiliaryCallback<TOutput, TCustom> = args[args.length - 1];
  const middlewares: HandlerMiddleware<any, TCustom>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastlbsValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);

  const wrappedAuxiliary: FastlbsAuxiliaryHandler<TOutput, TCustom> = Object.assign(
    async (rawEvent: any, context: Context): Promise<TOutput> => {
      const warmContext = await resolveWarmContext();
      const event = new FastlbsEvent<TCustom>(rawEvent, warmContext) as FastlbsContext<TCustom>;

      let currentIndex = -1;
      const dispatch = async (index: number): Promise<any> => {
        if (index <= currentIndex) {
          throw new HandlerErrorResponse(500, "next() called multiple times");
        }
        currentIndex = index;
        const middleware = middlewares[index];
        if (middleware) {
          return middleware(event, context, () => dispatch(index + 1));
        }
        const rawResult = await callback(event, context);
        if (rawResult instanceof HandlerStandardResponse) {
          return rawResult;
        }
        return new HandlerStandardResponse(200, {
          status: "success",
          message: "Auxiliary execution completed",
          data: rawResult,
        });
      };

      const result = await dispatch(0);
      return unwrapStandardResponse<TOutput>(result);
    },
    {
      __fastlbsAuxiliary: true as const,
      __fastlbsMetadata: {
        kind: "auxiliary" as const,
        options,
        validators,
      },
    }
  );

  return wrappedAuxiliary;
}

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  options: HandlerOptions<TCustom, TAuth>,
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth>[],
    callback: HandlerCallback<T, TCustom, TAuth>
  ]
): FastlbsLambdaHandler<TCustom, TAuth>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth>[],
    callback: HandlerCallback<T, TCustom, TAuth>
  ]
): FastlbsLambdaHandler<TCustom, TAuth>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  ...args: any[]
): FastlbsLambdaHandler<TCustom, TAuth> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom, TAuth> = hasOpts ? args[0] : {};
  const callback: HandlerCallback<T, TCustom, TAuth> = args[args.length - 1];
  const middlewares: HandlerMiddleware<T, TCustom, TAuth>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastlbsValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);

  const wrappedHandler: FastlbsLambdaHandler<TCustom, TAuth> = async (
    rawEvent: APIGatewayProxyEventV2,
    context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      const baseWarmContext = await resolveWarmContext();
      let mergedWarmContext: Record<string, unknown> = {
        ...(baseWarmContext && typeof baseWarmContext === "object" ? baseWarmContext : {}),
      };
      let explicitAuth: TAuth | undefined = undefined;

      const hasApiGwAuthorizer = Boolean(
        rawEvent?.requestContext && (rawEvent.requestContext as any).authorizer
      );

      // Check if an in-process Authorizer handler was passed via options.authorizer or options.event.authorizer
      const eventObj = Array.isArray(options.event) ? options.event[0] : options.event;
      const candidateAuthorizer =
        options.authorizer || (eventObj && (eventObj as HttpEventConfig).authorizer);

      if (typeof candidateAuthorizer === "function" && !hasApiGwAuthorizer) {
        if (typeof (candidateAuthorizer as any).resolveUser === "function") {
          explicitAuth = await (candidateAuthorizer as any).resolveUser(rawEvent, context);
        } else {
          const authPolicy = await (candidateAuthorizer as any)(rawEvent, context);
          if (authPolicy?.isAuthorized === false) {
            throw new HandlerErrorResponse(403, "Forbidden");
          }
          explicitAuth = (authPolicy?.user ?? authPolicy?.context ?? authPolicy) as TAuth;
        }
      }

      // Execute any pre-execution auxiliary or authorizer lambdas in options.before
      if (Array.isArray(options.before) && options.before.length > 0) {
        for (const preFn of options.before) {
          if (typeof preFn !== "function") continue;
          if ((preFn as any).__fastlbsAuthorizer) {
            if (!hasApiGwAuthorizer && explicitAuth === undefined) {
              explicitAuth = await (preFn as any).resolveUser(rawEvent, context);
            }
          } else {
            const auxOutput = await preFn(rawEvent, context);
            if (auxOutput && typeof auxOutput === "object" && !Array.isArray(auxOutput)) {
              mergedWarmContext = { ...mergedWarmContext, ...auxOutput };
            }
          }
        }
      }

      const event = new FastlbsEvent<TCustom, TAuth>(
        rawEvent,
        mergedWarmContext as TCustom,
        explicitAuth
      ) as FastlbsContext<TCustom, TAuth>;

      let currentIndex = -1;

      const dispatch = async (index: number): Promise<HandlerStandardResponse<T>> => {
        if (index <= currentIndex) {
          throw new HandlerErrorResponse(500, "next() called multiple times");
        }

        currentIndex = index;
        const middleware = middlewares[index];

        if (middleware) {
          return middleware(event, context, () => dispatch(index + 1));
        }

        return callback(event, context);
      };

      const result = await dispatch(0);
      return {
        statusCode: result.statusCode,
        body: JSON.stringify(result.responseBody),
      };
    } catch (error) {
      if (error instanceof HandlerErrorResponse) {
        return {
          statusCode: error.statusCode,
          body: JSON.stringify({
            message: error.message,
            error: error.error,
          }),
        };
      }
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "An unexpected error occurred",
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  };

  wrappedHandler.__fastlbsMetadata = {
    kind: "http",
    options,
    validators,
  };

  return wrappedHandler;
}
`;
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/wrappers/handlerResponse.wrapper.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, wrapperContent);
}
