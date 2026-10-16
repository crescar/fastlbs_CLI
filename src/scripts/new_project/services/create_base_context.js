import fs from 'fs';
import path from 'path';

export function createBaseContext(projectName) {
    const content =
`import type {
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

/**
 * FastlbsEvent wraps and implements APIGatewayProxyEventV2 while embedding
 * cold-start initialized data (secrets, database clients, environment variables, etc.),
 * pre-authenticated user data (from Authorizer lambdas), and direct auxiliary payloads
 * with static TypeScript typing.
 */
export class FastlbsEvent<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> implements APIGatewayProxyEventV2 {
  public readonly rawEvent: APIGatewayProxyEventV2;
  public readonly custom: TCustom;
  public readonly auth: TAuth;
  public readonly payload: unknown;

  // APIGatewayProxyEventV2 standard properties
  public readonly version: string;
  public readonly routeKey: string;
  public readonly rawPath: string;
  public readonly rawQueryString: string;
  public readonly cookies?: string[];
  public readonly headers: Record<string, string | undefined>;
  public readonly queryStringParameters?: Record<string, string | undefined>;
  public readonly requestContext: APIGatewayEventRequestContextV2;
  public readonly body?: string;
  public readonly isBase64Encoded: boolean;
  public readonly stageVariables?: Record<string, string | undefined>;
  public readonly pathParameters?: Record<string, string | undefined>;

  constructor(
    event: APIGatewayProxyEventV2,
    customContext: TCustom,
    explicitAuth?: TAuth
  ) {
    const safeEvent = (event && typeof event === "object" ? event : {}) as APIGatewayProxyEventV2;
    this.rawEvent = safeEvent;
    this.custom = customContext;
    this.auth = extractAuthorizerContext<TAuth>(safeEvent, explicitAuth);
    this.payload = (safeEvent as any).payload !== undefined ? (safeEvent as any).payload : safeEvent;

    this.version = safeEvent.version;
    this.routeKey = safeEvent.routeKey;
    this.rawPath = safeEvent.rawPath;
    this.rawQueryString = safeEvent.rawQueryString;
    this.cookies = safeEvent.cookies;
    this.headers = safeEvent.headers || {};
    this.queryStringParameters = safeEvent.queryStringParameters;
    this.requestContext = safeEvent.requestContext;
    this.body = safeEvent.body;
    this.isBase64Encoded = safeEvent.isBase64Encoded ?? false;
    this.stageVariables = safeEvent.stageVariables;
    this.pathParameters = safeEvent.pathParameters;

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
   * Returns the authenticated user data injected by an Authorizer Lambda.
   */
  public getAuthUser<TUser = TAuth>(): TUser {
    return this.auth as unknown as TUser;
  }

  /**
   * Returns the direct payload when invoked as an Auxiliary / General-Purpose Lambda.
   */
  public getPayload<TPayload = unknown>(): TPayload {
    if (typeof this.body === "string" && this.body.trim().length > 0) {
      return this.getJsonBody<TPayload>();
    }
    return (this.payload ?? {}) as TPayload;
  }

  /**
   * Safely parses JSON request body with optional generic typing.
   */
  public getJsonBody<TBody = unknown>(): TBody {
    if (!this.body) {
      return {} as TBody;
    }
    try {
      const raw = this.isBase64Encoded
        ? Buffer.from(this.body, "base64").toString("utf-8")
        : this.body;
      return JSON.parse(raw) as TBody;
    } catch {
      return {} as TBody;
    }
  }

  /**
   * Retrieves a query string parameter with optional fallback value.
   */
  public getQueryParam(key: string, defaultValue?: string): string | undefined {
    return this.queryStringParameters?.[key] ?? defaultValue;
  }

  /**
   * Retrieves a path parameter with optional fallback value.
   */
  public getPathParam(key: string, defaultValue?: string): string | undefined {
    return this.pathParameters?.[key] ?? defaultValue;
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
 * \`event.custom.<prop>\`, \`event.<prop>\`, \`event.auth\`, and \`event.getAuthUser()\` are all fully typed.
 */
export type FastlbsContext<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = FastlbsEvent<TCustom, TAuth> & TCustom;
`;

    const contextDir = path.join(process.cwd(), `${projectName}/libs/common/context`);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }
    const filePath = path.join(contextDir, 'fastlbsContext.ts');
    fs.writeFileSync(filePath, content.trimStart());
}

