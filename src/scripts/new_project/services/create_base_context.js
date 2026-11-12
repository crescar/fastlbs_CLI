import fs from 'fs';
import path from 'path';

export function createBaseContext(projectName) {
    const content =
`/* @fastlbs-i18n v1 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayEventRequestContextV2,
} from "aws-lambda";

export interface DefaultWarmContext {
  secrets?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  db?: unknown;
  [key: string]: unknown;
}

export interface DefaultAuthUser {
  id?: string;
  email?: string;
  roles?: string[];
  locale?: string;
  [key: string]: unknown;
}

function extractAuthorizerContext<TAuth>(
  rawEvent: any,
  explicitAuth?: TAuth
): TAuth {
  if (explicitAuth !== undefined && explicitAuth !== null) {
    return explicitAuth;
  }

  const rawAuthorizer =
    rawEvent?.requestContext?.authorizer?.lambda ??
    rawEvent?.requestContext?.authorizer?.claims ??
    rawEvent?.requestContext?.authorizer;

  if (!rawAuthorizer || typeof rawAuthorizer !== "object") {
    return {} as TAuth;
  }

  // If created by FastLBS handlerAuthorizer, __fastlbsAuth holds the full JSON-serialized user
  if (typeof rawAuthorizer.__fastlbsAuth === "string") {
    try {
      return JSON.parse(rawAuthorizer.__fastlbsAuth) as TAuth;
    } catch {
      // Fallback to raw fields below
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawAuthorizer)) {
    if (key === "integrationLatency" || key === "principalId" && Object.keys(rawAuthorizer).length > 1) {
      continue;
    }
    if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
      try {
        cleaned[key] = JSON.parse(val);
        continue;
      } catch {
        // Keep string as-is
      }
    }
    cleaned[key] = val;
  }

  if (!cleaned.id && typeof rawAuthorizer.principalId === "string") {
    cleaned.id = rawAuthorizer.principalId;
  }

  return cleaned as TAuth;
}

function fallbackInterpolate(
  template: string,
  params?: Record<string, unknown>
): string {
  if (!params || typeof params !== "object") return template;
  return String(template).replace(/\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}/g, (match, token) => {
    const val = params[token];
    return val === undefined || val === null ? match : String(val);
  });
}

/**
 * FastlbsEvent wraps and implements APIGatewayProxyEventV2 while embedding
 * cold-start initialized data (secrets, database clients, environment variables, etc.),
 * pre-authenticated user data (from Authorizer lambdas), direct auxiliary payloads,
 * and per-request i18n translation helpers with static TypeScript typing.
 */
export class FastlbsEvent<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
> implements APIGatewayProxyEventV2 {
  public readonly rawEvent: APIGatewayProxyEventV2;
  public readonly custom: TCustom;
  public readonly auth: TAuth;
  public payload: unknown;
  public locale: string = "en";
  private translateFn?: (key: string, params?: Record<string, unknown>) => string;
  private _parsedBody?: unknown;
  private _hasParsedBody: boolean = false;
  public readonly validated: {
    body?: unknown;
    query?: Record<string, unknown>;
    path?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    payload?: unknown;
  } = {};

  // Normalized API Gateway V1 (REST) & V2 (HTTP API) properties
  public readonly version: string;
  public readonly routeKey: string;
  public readonly rawPath: string;
  public readonly path: string;
  public readonly httpMethod: string;
  public readonly rawQueryString: string;
  public readonly cookies?: string[];
  public headers: Record<string, string | undefined>;
  public queryStringParameters?: Record<string, any>;
  public readonly requestContext: APIGatewayEventRequestContextV2;
  public readonly body?: string;
  public readonly isBase64Encoded: boolean;
  public readonly stageVariables?: Record<string, string | undefined>;
  public pathParameters?: Record<string, any>;

  constructor(
    event: APIGatewayProxyEventV2,
    customContext: TCustom,
    explicitAuth?: TAuth
  ) {
    const safeEvent = (event && typeof event === "object" ? event : {}) as APIGatewayProxyEventV2 & {
      path?: string;
      httpMethod?: string;
      multiValueHeaders?: Record<string, string[] | undefined>;
    };
    this.rawEvent = safeEvent;
    this.custom = customContext;
    this.auth = extractAuthorizerContext<TAuth>(safeEvent, explicitAuth);
    this.payload = (safeEvent as any).payload !== undefined ? (safeEvent as any).payload : safeEvent;

    this.version = safeEvent.version ?? "2.0";
    this.rawPath = safeEvent.rawPath ?? safeEvent.path ?? "";
    this.path = safeEvent.path ?? safeEvent.rawPath ?? "";
    this.httpMethod =
      safeEvent.requestContext?.http?.method ??
      safeEvent.httpMethod ??
      (typeof safeEvent.routeKey === "string" && safeEvent.routeKey.includes(" ")
        ? safeEvent.routeKey.split(" ")[0]
        : "GET");
    this.routeKey =
      safeEvent.routeKey ??
      (this.rawPath ? \`\${this.httpMethod.toUpperCase()} \${this.rawPath}\` : "");
    this.rawQueryString = safeEvent.rawQueryString ?? "";
    this.headers = safeEvent.headers && typeof safeEvent.headers === "object"
      ? { ...safeEvent.headers }
      : {};

    if (Array.isArray(safeEvent.cookies)) {
      this.cookies = safeEvent.cookies;
    } else {
      const cookieHeader = this.getHeader("cookie");
      if (cookieHeader) {
        this.cookies = cookieHeader
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean);
      }
    }

    this.queryStringParameters =
      safeEvent.queryStringParameters && typeof safeEvent.queryStringParameters === "object"
        ? { ...safeEvent.queryStringParameters }
        : undefined;
    this.requestContext = safeEvent.requestContext;
    this.body = safeEvent.body ?? undefined;
    this.isBase64Encoded = safeEvent.isBase64Encoded ?? false;
    this.stageVariables = safeEvent.stageVariables ?? undefined;
    this.pathParameters =
      safeEvent.pathParameters && typeof safeEvent.pathParameters === "object"
        ? { ...safeEvent.pathParameters }
        : undefined;

    // Direct access helper: assign non-conflicting custom properties to root level
    if (customContext && typeof customContext === "object") {
      for (const [key, value] of Object.entries(customContext)) {
        if (!(key in this)) {
          (this as any)[key] = value;
        }
      }
    }
  }

  /**
   * @internal Bound automatically by validatorMiddleware when a Zod schema transforms or defaults input data.
   */
  public setValidatedData(
    target: "BODY" | "QUERYPARAMS" | "PATHPARAMS" | "HEADERS" | "PAYLOAD" | string,
    data: unknown
  ): void {
    switch (target) {
      case "BODY":
        this._parsedBody = data;
        this._hasParsedBody = true;
        this.validated.body = data;
        break;
      case "QUERYPARAMS":
        if (data && typeof data === "object") {
          this.validated.query = data as Record<string, unknown>;
          this.queryStringParameters = {
            ...(this.queryStringParameters || {}),
            ...(data as Record<string, any>),
          };
        }
        break;
      case "PATHPARAMS":
        if (data && typeof data === "object") {
          this.validated.path = data as Record<string, unknown>;
          this.pathParameters = {
            ...(this.pathParameters || {}),
            ...(data as Record<string, any>),
          };
        }
        break;
      case "HEADERS":
        if (data && typeof data === "object") {
          this.validated.headers = data as Record<string, unknown>;
          this.headers = {
            ...(this.headers || {}),
            ...(data as Record<string, string | undefined>),
          };
        }
        break;
      case "PAYLOAD":
        this.validated.payload = data;
        this.payload = data;
        this._parsedBody = data;
        this._hasParsedBody = true;
        break;
    }
  }

  /**
   * @internal Bound automatically by the FastLBS wrapper when HandlerOptions.i18n is configured.
   */
  public bindI18n(
    locale: string,
    translateFn: (key: string, params?: Record<string, unknown>) => string
  ): void {
    this.locale = locale;
    this.translateFn = translateFn;
  }

  /**
   * Translates a key into the negotiated request locale with optional variable interpolation
   * and pluralization ({ count }). Falls back to the key itself when i18n is not configured.
   */
  public t(key: TI18nKey, params?: Record<string, unknown>): string {
    if (this.translateFn) {
      return this.translateFn(key, params);
    }
    return fallbackInterpolate(String(key), params);
  }

  /**
   * Returns the negotiated locale for the current request (e.g. "en", "es").
   */
  public getLocale(): string {
    return this.locale;
  }

  /**
   * Returns the authenticated user data injected by an Authorizer Lambda.
   */
  public getAuthUser<TUser = TAuth>(): TUser {
    return this.auth as unknown as TUser;
  }

  /**
   * Returns the direct payload when invoked as an Auxiliary / General-Purpose Lambda.
   * Returns Zod-transformed payload if validatorMiddleware(schema, ValidationOptions.PAYLOAD) ran.
   */
  public getPayload<TPayload = unknown>(): TPayload {
    if (this.validated.payload !== undefined) {
      return this.validated.payload as TPayload;
    }
    if (typeof this.body === "string" && this.body.trim().length > 0) {
      return this.getJsonBody<TPayload>();
    }
    return (this.payload ?? {}) as TPayload;
  }

  /**
   * Safely parses JSON request body once per request (or returns the Zod-transformed body
   * if validatorMiddleware ran). Never executes redundant JSON.parse calls.
   */
  public getJsonBody<TBody = unknown>(): TBody {
    if (this._hasParsedBody) {
      return this._parsedBody as TBody;
    }
    if (!this.body) {
      this._parsedBody = {};
      this._hasParsedBody = true;
      return this._parsedBody as TBody;
    }
    if (typeof this.body === "object") {
      this._parsedBody = this.body;
      this._hasParsedBody = true;
      return this._parsedBody as TBody;
    }
    try {
      const raw = this.isBase64Encoded
        ? Buffer.from(this.body, "base64").toString("utf-8")
        : this.body;
      this._parsedBody = JSON.parse(raw);
      this._hasParsedBody = true;
      return this._parsedBody as TBody;
    } catch {
      return {} as TBody;
    }
  }

  /**
   * Returns the full query parameters object (including Zod coercions/defaults if validated).
   */
  public getValidatedQuery<TQuery = Record<string, unknown>>(): TQuery {
    return (this.validated.query ?? this.queryStringParameters ?? {}) as TQuery;
  }

  /**
   * Returns the full path parameters object (including Zod coercions/defaults if validated).
   */
  public getValidatedPathParams<TParams = Record<string, unknown>>(): TParams {
    return (this.validated.path ?? this.pathParameters ?? {}) as TParams;
  }

  /**
   * Retrieves a query string parameter with optional fallback value.
   */
  public getQueryParam<TVal = string>(key: string, defaultValue?: TVal): TVal | undefined {
    const val = this.queryStringParameters?.[key];
    return (val !== undefined ? val : defaultValue) as TVal | undefined;
  }

  /**
   * Retrieves a path parameter with optional fallback value.
   */
  public getPathParam<TVal = string>(key: string, defaultValue?: TVal): TVal | undefined {
    const val = this.pathParameters?.[key];
    return (val !== undefined ? val : defaultValue) as TVal | undefined;
  }

  /**
   * Retrieves a header value case-insensitively.
   */
  public getHeader(key: string): string | undefined {
    const lowerKey = key.toLowerCase();
    for (const [headerName, headerValue] of Object.entries(this.headers || {})) {
      if (headerName.toLowerCase() === lowerKey) {
        return headerValue;
      }
    }
    return undefined;
  }
}

/**
 * FastlbsContext provides combined typed access:
 * \`event.custom.<prop>\`, \`event.<prop>\`, \`event.auth\`, \`event.getAuthUser()\`, and \`event.t()\` are all fully typed.
 */
export type FastlbsContext<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser,
  TI18nKey extends string = string
> = FastlbsEvent<TCustom, TAuth, TI18nKey> & TCustom;
`;

    const contextDir = path.join(process.cwd(), `${projectName}/libs/common/context`);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }
    const filePath = path.join(contextDir, 'fastlbsContext.ts');
    fs.writeFileSync(filePath, content.trimStart());
}
