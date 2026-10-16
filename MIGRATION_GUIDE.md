# FastLBS v1 to v2 Migration Guide

Welcome to the FastLBS v2 migration guide! This document explains how to upgrade your existing FastLBS projects to take advantage of **TypeScript-native dev**, **Cold-Start Warmup**, **Zero-Manual OpenAPI documentation with Zod**, and **Typed Context**.

---

## Quick Migration Checklist

| Step | Task | Effort |
| :---: | :--- | :---: |
| 1 | Upgrade FastLBS CLI to `v2.0.x` | 1 min |
| 2 | Update `@my-api/common` files (`fastlbsContext.ts`, wrappers) | 2 mins |
| 3 | Replace `APIGatewayProxyEventV2` with `FastlbsContext` in handlers | 5 mins |
| 4 | Migrate DB / Secrets connection to `init` cold-start hook | 5 mins |
| 5 | Clean up manual Swagger JSON schemas in favor of Zod | 5 mins |
| 6 | Verify local dev with `fastlbs start` and run tests | 2 mins |

---

## Step 1: Upgrade the FastLBS CLI

Update the global CLI to the latest version:

```bash
# If installed globally via npm:
npm install -g fastlbs@latest

# Verify version:
fastlbs --version
# Expected: >= 2.0.1
```

---

## Step 2: Update Shared Project Common Files

In v2, FastLBS introduces `FastlbsEvent` and `FastlbsContext` inside `@my-api/common/context/fastlbsContext.ts`.

If you have an existing v1 project, you can generate the new files by creating a test project or copying the updated context definition into `lambdas/@common/context/fastlbsContext.ts`:

```typescript
// lambdas/@common/context/fastlbsContext.ts
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

export interface DefaultWarmContext {
  [key: string]: any;
}

export class FastlbsEvent<TCustom = DefaultWarmContext, TAuth = any> {
  public rawEvent: APIGatewayProxyEventV2;
  public custom: TCustom;
  public auth?: TAuth;

  constructor(rawEvent: APIGatewayProxyEventV2, customContext?: TCustom, authUser?: TAuth) {
    this.rawEvent = rawEvent;
    this.custom = (customContext || {}) as TCustom;
    this.auth = authUser;
  }

  getQueryParam(param: string, defaultValue = ""): string {
    return this.rawEvent.queryStringParameters?.[param] ?? defaultValue;
  }

  getPathParam(param: string, defaultValue = ""): string {
    return this.rawEvent.pathParameters?.[param] ?? defaultValue;
  }

  getHeader(header: string, defaultValue = ""): string {
    const target = header.toLowerCase();
    const headers = this.rawEvent.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target && value !== undefined) {
        return value;
      }
    }
    return defaultValue;
  }

  getJsonBody<T = any>(defaultValue?: T): T {
    if (!this.rawEvent.body) return (defaultValue ?? {}) as T;
    try {
      const raw = this.rawEvent.isBase64Encoded
        ? Buffer.from(this.rawEvent.body, "base64").toString("utf-8")
        : this.rawEvent.body;
      return JSON.parse(raw);
    } catch {
      return (defaultValue ?? {}) as T;
    }
  }

  getAuthUser<T = TAuth>(): T | undefined {
    return this.auth as T;
  }
}

export type FastlbsContext<TCustom = DefaultWarmContext, TAuth = any> = FastlbsEvent<TCustom, TAuth>;
```

---

## Step 3: Migrate Service Handlers

### Before (v1):
In v1, handlers accepted the raw `APIGatewayProxyEventV2` and manual parsing was required:

```typescript
// v1 - lambdas/greeting/src/services/index.ts
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";

export async function service(event: APIGatewayProxyEventV2, context: Context) {
  // Manual, unsafe parsing:
  const query = event.queryStringParameters || {};
  const name = query.name || "World";
  
  // Custom context had to be cast:
  const db = (global as any).myDbConnection;

  return new HandlerStandardResponse(200, {
    status: "success",
    message: `Hello, ${name}!`,
  });
}
```

### After (v2):
In v2, use `FastlbsContext` to gain safe typing and intuitive helper methods:

```typescript
// v2 - lambdas/greeting/src/services/index.ts
import type { Context } from "aws-lambda";
import type { FastlbsContext } from "@my-api/common/context/fastlbsContext";
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";

interface AppContext {
  db: DatabaseConnection;
}

export async function service(
  event: FastlbsContext<AppContext>,
  context: Context
) {
  // Clean, safe helper methods:
  const name = event.getQueryParam("name", "World");
  
  // Type-safe custom warm context:
  const db = event.custom.db;

  return new HandlerStandardResponse(200, {
    status: "success",
    message: `Hello, ${name}!`,
  });
}
```

---

## Step 4: Add Cold-Start Warmup (`init`)

To eliminate recurring latency from connecting to databases or decrypting secrets on every request:

```typescript
// lambdas/greeting/src/index.ts
import { handlerResponse } from "@my-api/common/wrappers/handlerResponse.wrapper";
import { service } from "./services";

// Define your warm context type:
interface AppContext {
  db: DatabaseClient;
}

// init runs ONCE during the container's cold start:
const init = async (): Promise<AppContext> => {
  const db = await createDatabasePool();
  return { db };
};

export const handler = handlerResponse<ResponseType, AppContext>(
  {
    init,
    event: { method: "GET", path: "v1/greeting", cors: true },
    doc: {
      summary: "Get greeting",
      tags: ["GREETING"],
    },
  },
  service
);
```

---

## Step 5: Migrate OpenAPI Documentation to Zod

### Before (v1):
In v1, you had to manually maintain JSON documentation schemas in `lambdas/__doc__/src/documents`.

### After (v2):
FastLBS v2 automatically introspects your Zod validation schemas passed to `validatorMiddleware`:

```typescript
import { z } from "zod";
import { validatorMiddleware, ValidationOptions } from "@my-api/common/middlewares/validator.middleware";

const QuerySchema = z.object({
  name: z.string().describe("User name to greet"),
});

export const handler = handlerResponse(
  {
    event: { method: "GET", path: "v1/greeting", cors: true },
    doc: {
      summary: "Personalized greeting",
      response: ResponseSchema,
      security: ["BearerAuth"],
      errors: {
        400: { description: "Validation error", schema: ErrorSchema },
      },
    },
  },
  validatorMiddleware(QuerySchema, ValidationOptions.QUERYPARAMS),
  service
);
```

When you start the app, Swagger UI at `http://localhost:3000/api/doc` will automatically display the query parameter, responses, and security definitions!

---

## Step 6: Choose Your Production Build Strategy

FastLBS v2 introduces two build strategies via the `--type` flag:

```bash
# 1. Single-file self-contained bundle (similar to v1):
fastlbs build greeting --type bundle

# 2. Modular build for AWS Lambda Layers (v2 recommended):
fastlbs build greeting --type modular
```

The `modular` build analyzes your lambda's exact imports using `esbuild` and generates an isolated `dist/<lambda>/package.json`, making it trivial to create minimal Lambda Layers and speed up cold starts.

---

## Need Help?

- Check the [FastLBS README](./README.md) for full documentation.
- See [What's New in v2.0](./WHATS_NEW.md) for architectural details.
- Open an issue on [GitHub](https://github.com/crescar/fastlbs_CLI/issues).

