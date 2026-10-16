# Changelog

All notable changes to the **FastLBS** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.1] - 2026-10-16

### Added
- **Cold-Start Warmup Hook (`init`)**: Handlers can now define an asynchronous `init` callback in `handlerResponse({ init }, service)` that executes once during the container's cold start. Resolved database connection pools (Prisma, TypeORM), AWS Secrets Manager credentials, and configuration objects are cached in memory and injected into `event.custom`.
- **`FastlbsEvent` & `FastlbsContext<TCustom, TAuth>`**: Strongly-typed container context extending and wrapping AWS `APIGatewayProxyEventV2`. Includes helper methods:
  - `event.getQueryParam(name, defaultValue)`
  - `event.getPathParam(name, defaultValue)`
  - `event.getHeader(name, defaultValue)`
  - `event.getJsonBody<T>(defaultValue)`
  - `event.getAuthUser<T>()`
  - `event.getPayload<T>()`
- **Zero-Manual OpenAPI 3.0 / Swagger UI Generation from Zod**:
  - Automatically introspects `validatorMiddleware` Zod schemas and maps queries, path params, headers, and request bodies to OpenAPI 3.0 via `z.toJSONSchema()`.
  - Built-in support for `BearerAuth` (JWT) and `BasicAuth` security schemes.
  - Native support for `.describe()` and `.meta({ example: "..." })` annotations.
  - Declarative error response documentation via `doc.errors: { 400: ErrorSchema, 404: NotFoundSchema }`.
- **Bi-Directional Serverless Synchronization**:
  - `lambda_config_sync.js` automatically updates `serverlessConfig/functions/<lambda>.json` and `serverless.yml` from code declarations in `handlerResponse({ event: ... })` or `@fastlbs` JSDoc annotations without manual configuration editing.
- **Dedicated Authorizers & Auxiliary Workers**:
  - `handlerAuthorizer<TUser>`: Scaffolds AWS API Gateway IAM authorization policies (`Effect: "Allow" | "Deny"`) and serializes user identity.
  - `handlerAuxiliary<TOutput>`: Non-HTTP lambda wrapper for queue processors (SQS), cron jobs, and internal workers.
  - Declarative chaining with `before: [authAuthorizer, auditLogAuxiliary]`.
- **Dual Production Build Strategies**:
  - `--type bundle`: Single-file self-contained JavaScript artifact with all dependencies inlined via esbuild.
  - `--type modular`: Generates an isolated `package.json` with only the dependencies used by that specific lambda, enabling cold-start optimization via AWS Lambda Layers.
- **Comprehensive Smoke Test Suite**:
  - 23 automated tests in `tests/cli.smoke.test.js` covering CLI flags, validation rules, context wrappers, Zod OpenAPI extraction, build types, and Serverless sync.

### Changed
- **Direct TypeScript Development**: `fastlbs start` compiles TypeScript lambdas on the fly using esbuild in milliseconds without requiring manual build commands.
- **Modular Lambda Scaffolding**: Refactored generated lambda directories into clean `schemas/`, `services/`, and `index.ts` files.
- **Standardized Error Handling**: Unified `FastlbsError` class providing actionable resolution hints and appropriate shell exit codes.

### Removed
- Removed manual, error-prone JSON schema files in `lambdas/__doc__/src/documents`.

---

## [1.0.0] - Prior Release on `main`

- Initial release of FastLBS CLI.
- Scaffolding of basic TypeScript AWS Lambda projects with Serverless Framework.
- Local execution with Serverless Offline.
- Basic Jest testing integration.

