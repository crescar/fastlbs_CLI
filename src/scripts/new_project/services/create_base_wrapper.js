import fs from 'fs';
import path from 'path';

export function createBaseWrapper(projectName) {
    const wrapperContent =
`/* @fastlbs-i18n v1 */
try {
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

export interface FastlbsI18nAdapter<TKey extends string = string> {
  readonly defaultLocale: string;
  readonly locales: string[];
  resolveLocale(event: any): string;
  translator(locale?: string): (key: TKey | (string & {}), params?: Record<string, unknown>) => string;
  t(key: string, params?: Record<string, unknown>, locale?: string): string;
  has?(key: string, locale?: string): boolean;
}

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
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
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
   * Optional i18n instance created with defineI18n({...}) to negotiate request locale,
   * bind event.t(key, params), translate errors, and emit the Content-Language header.
   */
  i18n?: FastlbsI18nAdapter<TI18nKey>;

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
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
> = (
  event: FastlbsContext<TCustom, TAuth, TI18nKey>,
  context: Context
) => Promise<HandlerStandardResponse<T>>;

export type AuthorizerCallback<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
> = (
  event: FastlbsContext<TCustom, DefaultAuthUser, TI18nKey>,
  context: Context
) => Promise<TUser | HandlerStandardResponse<TUser>>;

export type AuxiliaryCallback<
  TOutput = unknown,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
> = (
  event: FastlbsContext<TCustom, DefaultAuthUser, TI18nKey>,
  context: Context
) => Promise<TOutput | HandlerStandardResponse<TOutput>>;

export type MiddlewareNext<T = any> = () => Promise<HandlerStandardResponse<T>>;

export type HandlerMiddleware<
  T = any,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
> = (
  event: FastlbsContext<TCustom, TAuth, TI18nKey>,
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
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
> = ((
  event: APIGatewayProxyEventV2,
  context: Context
) => Promise<APIGatewayProxyResultV2>) & {
  __fastlbsMetadata?: {
    kind: "http";
    options: HandlerOptions<TCustom, TAuth, TI18nKey>;
    validators: Array<{ schema: ZodType; option: string }>;
    i18n?: {
      defaultLocale: string;
      locales: string[];
    };
  };
};

export type FastlbsAuthorizerHandler<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
> = ((
  event: APIGatewayProxyEventV2,
  context: Context
) => Promise<AuthorizerPolicyResponse<TUser>>) & {
  __fastlbsAuthorizer: true;
  resolveUser: (event: APIGatewayProxyEventV2, context: Context) => Promise<TUser>;
  __fastlbsMetadata?: {
    kind: "authorizer";
    options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey>;
    validators: Array<{ schema: ZodType; option: string }>;
    i18n?: {
      defaultLocale: string;
      locales: string[];
    };
  };
};

export type FastlbsAuxiliaryHandler<
  TOutput = unknown,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
> = ((
  event: any,
  context: Context
) => Promise<TOutput>) & {
  __fastlbsAuxiliary: true;
  __fastlbsMetadata?: {
    kind: "auxiliary";
    options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey>;
    validators: Array<{ schema: ZodType; option: string }>;
    i18n?: {
      defaultLocale: string;
      locales: string[];
    };
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

function applyEventI18n(
  event: FastlbsEvent<any, any, any>,
  i18n?: FastlbsI18nAdapter<any>
): string | undefined {
  if (!i18n || typeof i18n.resolveLocale !== "function") {
    return undefined;
  }
  const activeLocale = i18n.resolveLocale(event);
  const translateFn = i18n.translator(activeLocale);
  event.bindI18n(activeLocale, (key, params) => translateFn(key, params));
  return activeLocale;
}

function translateErrorMessage(
  error: HandlerErrorResponse,
  i18n?: FastlbsI18nAdapter<any>,
  locale?: string
): string {
  if (!i18n || typeof i18n.t !== "function") {
    return error.message;
  }
  const activeLocale = locale || i18n.defaultLocale || "en";
  if (error.messageKey) {
    if (typeof i18n.has !== "function" || i18n.has(error.messageKey, activeLocale)) {
      return i18n.t(error.messageKey, error.messageParams, activeLocale);
    }
    return error.message;
  }
  if (typeof i18n.has === "function" && i18n.has(error.message, activeLocale)) {
    return i18n.t(error.message, error.messageParams, activeLocale);
  }
  return error.message;
}

function createWarmContextResolver<TCustom>(options: HandlerOptions<TCustom, any, any>) {
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
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(
  options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey>,
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[],
    callback: AuthorizerCallback<TUser, TCustom, TI18nKey>
  ]
): FastlbsAuthorizerHandler<TUser, TCustom, TI18nKey>;

export function handlerAuthorizer<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[],
    callback: AuthorizerCallback<TUser, TCustom, TI18nKey>
  ]
): FastlbsAuthorizerHandler<TUser, TCustom, TI18nKey>;

export function handlerAuthorizer<
  TUser = DefaultAuthUser,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(...args: any[]): FastlbsAuthorizerHandler<TUser, TCustom, TI18nKey> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey> = hasOpts ? args[0] : {};
  const callback: AuthorizerCallback<TUser, TCustom, TI18nKey> = args[args.length - 1];
  const middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[] = hasOpts
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
    const event = new FastlbsEvent<TCustom, DefaultAuthUser, TI18nKey>(
      rawEvent,
      warmContext
    ) as FastlbsContext<TCustom, DefaultAuthUser, TI18nKey>;
    applyEventI18n(event, options.i18n);

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

  const wrappedAuthorizer: FastlbsAuthorizerHandler<TUser, TCustom, TI18nKey> = Object.assign(
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
          const activeLocale = options.i18n?.resolveLocale?.(rawEvent);
          const translatedMsg = translateErrorMessage(error, options.i18n, activeLocale);
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
              errorMessage: translatedMsg || "Forbidden",
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
        ...(options.i18n
          ? {
              i18n: {
                defaultLocale: options.i18n.defaultLocale,
                locales: options.i18n.locales,
              },
            }
          : {}),
      },
    }
  );

  return wrappedAuthorizer;
}

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(
  options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey>,
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[],
    callback: AuxiliaryCallback<TOutput, TCustom, TI18nKey>
  ]
): FastlbsAuxiliaryHandler<TOutput, TCustom, TI18nKey>;

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(
  ...args: [
    ...middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[],
    callback: AuxiliaryCallback<TOutput, TCustom, TI18nKey>
  ]
): FastlbsAuxiliaryHandler<TOutput, TCustom, TI18nKey>;

export function handlerAuxiliary<
  TOutput = unknown,
  TCustom = DefaultWarmContext,
  TI18nKey extends string = string
>(...args: any[]): FastlbsAuxiliaryHandler<TOutput, TCustom, TI18nKey> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom, DefaultAuthUser, TI18nKey> = hasOpts ? args[0] : {};
  const callback: AuxiliaryCallback<TOutput, TCustom, TI18nKey> = args[args.length - 1];
  const middlewares: HandlerMiddleware<any, TCustom, DefaultAuthUser, TI18nKey>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastlbsValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);

  const wrappedAuxiliary: FastlbsAuxiliaryHandler<TOutput, TCustom, TI18nKey> = Object.assign(
    async (rawEvent: any, context: Context): Promise<TOutput> => {
      const warmContext = await resolveWarmContext();
      const event = new FastlbsEvent<TCustom, DefaultAuthUser, TI18nKey>(
        rawEvent,
        warmContext
      ) as FastlbsContext<TCustom, DefaultAuthUser, TI18nKey>;
      applyEventI18n(event, options.i18n);

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
        ...(options.i18n
          ? {
              i18n: {
                defaultLocale: options.i18n.defaultLocale,
                locales: options.i18n.locales,
              },
            }
          : {}),
      },
    }
  );

  return wrappedAuxiliary;
}

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
>(
  options: HandlerOptions<TCustom, TAuth, TI18nKey>,
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth, TI18nKey>[],
    callback: HandlerCallback<T, TCustom, TAuth, TI18nKey>
  ]
): FastlbsLambdaHandler<TCustom, TAuth, TI18nKey>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
>(
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth, TI18nKey>[],
    callback: HandlerCallback<T, TCustom, TAuth, TI18nKey>
  ]
): FastlbsLambdaHandler<TCustom, TAuth, TI18nKey>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
>(
  ...args: any[]
): FastlbsLambdaHandler<TCustom, TAuth, TI18nKey> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom, TAuth, TI18nKey> = hasOpts ? args[0] : {};
  const callback: HandlerCallback<T, TCustom, TAuth, TI18nKey> = args[args.length - 1];
  const middlewares: HandlerMiddleware<T, TCustom, TAuth, TI18nKey>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastlbsValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);

  const wrappedHandler: FastlbsLambdaHandler<TCustom, TAuth, TI18nKey> = async (
    rawEvent: APIGatewayProxyEventV2,
    context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    let activeLocale: string | undefined = undefined;
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
            throw new HandlerErrorResponse(403, "Forbidden", undefined, {
              messageKey: "common.errors.forbidden",
            });
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

      const event = new FastlbsEvent<TCustom, TAuth, TI18nKey>(
        rawEvent,
        mergedWarmContext as TCustom,
        explicitAuth
      ) as FastlbsContext<TCustom, TAuth, TI18nKey>;
      activeLocale = applyEventI18n(event, options.i18n);

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
      const responseHeaders: Record<string, string> = {
        ...(activeLocale ? { "Content-Language": activeLocale } : {}),
        ...(result.headers || {}),
      };
      return {
        statusCode: result.statusCode,
        ...(Object.keys(responseHeaders).length > 0 ? { headers: responseHeaders } : {}),
        body: JSON.stringify(result.responseBody),
      };
    } catch (error) {
      if (options.i18n && !activeLocale && typeof options.i18n.resolveLocale === "function") {
        try {
          activeLocale = options.i18n.resolveLocale(rawEvent);
        } catch {
          activeLocale = options.i18n.defaultLocale;
        }
      }
      const errorHeaders = activeLocale ? { headers: { "Content-Language": activeLocale } } : {};

      if (error instanceof HandlerErrorResponse) {
        const translatedMessage = translateErrorMessage(error, options.i18n, activeLocale);
        return {
          statusCode: error.statusCode,
          ...errorHeaders,
          body: JSON.stringify({
            message: translatedMessage,
            error: error.error,
          }),
        };
      }

      const unexpectedMessage =
        options.i18n &&
        typeof options.i18n.has === "function" &&
        options.i18n.has("common.errors.unexpected", activeLocale)
          ? options.i18n.t("common.errors.unexpected", undefined, activeLocale)
          : "An unexpected error occurred";

      return {
        statusCode: 500,
        ...errorHeaders,
        body: JSON.stringify({
          message: unexpectedMessage,
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  };

  wrappedHandler.__fastlbsMetadata = {
    kind: "http",
    options,
    validators,
    ...(options.i18n
      ? {
          i18n: {
            defaultLocale: options.i18n.defaultLocale,
            locales: options.i18n.locales,
          },
        }
      : {}),
  };

  return wrappedHandler;
}
`;
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/wrappers/handlerResponse.wrapper.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, wrapperContent);
}
