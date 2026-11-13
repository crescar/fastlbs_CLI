# Changelog

All notable changes to the **FastLBS** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Multi-Package-Manager Support (`npm`, `pnpm`, `yarn`)**:
  - `fastlbs new <name>` now prompts interactively to choose `npm`, `pnpm`, or `yarn`, or accepts `--pm, --package-manager <pm>`, `--skip-install`, and `-y, --yes` (auto-detecting from `npm_config_user_agent` when omitted in non-interactive mode).
  - Persists `packageManager` in `fastlbs.config.json` and writes Corepack `packageManager: "<pm>@<version>"` into `package.json`.
  - Automatically generates `pnpm-workspace.yaml` + `.npmrc` (`node-linker=hoisted`) for `pnpm` (omitting `package.json#workspaces`) and `.yarnrc.yml` (`nodeLinker: node-modules`) when Yarn Berry (v2+) is detected.
  - Updated `fastlbs lambda`, `fastlbs start`, `fastlbs test`, `fastlbs build`, and `fastlbs upgrade` to resolve and execute commands/hints using the project's configured package manager (with lockfile fallback for existing projects).

---

## [3.1.0] - 2026-11-12

### Added
- **In-Place Runtime Upgrade Command (`fastlbs upgrade [--check] [--no-backup]`)**:
  - Tracks `runtimeVersion` in `fastlbs.config.json` and safely updates `libs/common/*` runtime files (`fastlbsContext.ts`, `handlerResponse.wrapper.ts`, `validator.middleware.ts`, `zodOpenApi.util.ts`, `i18n/index.ts`) and Serverless packaging configuration with `.bak` backups.
- **Persisted Zod Transformations & Single-Parse Body Caching**:
  - `validatorMiddleware` now stores `result.data` from `schema.safeParse()` via `event.setValidatedData(option, result.data)`.
  - Added `event.getValidatedQuery<T>()` and `event.getValidatedPathParams<T>()`, and updated `event.getJsonBody<T>()`, `event.getQueryParam()`, `event.getPathParam()`, `event.getHeader()`, and `event.getPayload()` to return Zod-transformed/coerced values (`z.coerce.number()`, `.default()`, `.trim()`, `.transform()`) while parsing JSON bodies at most once per request.
- **Non-Interactive CLI Flags for CI/CD Automation**:
  - Added `-k, --kind <http|authorizer|auxiliary>`, `-m, --method <method>`, `-p, --path <path>`, `-v, --api-version <version>`, `--authorizer <name>`, `--before <names>`, `--api-gateway <http|httpApi>`, and `-y, --yes` to `fastlbs lambda <name>`, plus `-y, --yes` to `fastlbs drop <name>`.

### Changed
- **Per-Lambda Isolated Serverless Packaging (`package.individually: true`)**:
  - Replaced monolithic `patterns: ["dist/**", "node_modules/**"]` with `package: { individually: true, excludeDevDependencies: true, patterns: ["!**"] }`, per-function `package: { patterns: ["dist/<lambda>/**"] }`, and isolated `node_modules/swagger-ui-dist/**` strictly inside `__doc__` functions.
  - Added `"build": { "esbuild": false }` in `basicServerlessConfig.json` for Serverless Framework v3 and v4 compatibility.
- **Non-Destructive `serverless.yml` Smart Merge**:
  - `autoGenerateServerless()` now parses existing `serverless.yml` files and preserves custom CloudFormation `resources`, `layers`, `provider.iam`, `provider.vpc`, `provider.environment`, extra `plugins`, custom function properties (`memorySize`, `timeout`, `layers`, `environment`), and external functions.
- **Enhanced Constant Resolution in `lambda_config_sync.js`**:
  - Resolves local `const`/`let`/`var` identifiers and relative imported constants (`import { EVENT_CONFIG } from "./config"`) in `handlerResponse(options, service)` in addition to inline object literals and `@fastlbs` JSDoc tags.
- **API Gateway V1 (`http`) & V2 (`httpApi`) Normalization**:
  - `FastlbsEvent` normalizes V1 (`path`, `httpMethod`, `headers.Cookie`, `null` query/path maps) and V2 (`rawPath`, `requestContext.http.method`, `cookies[]`) seamlessly, and supports `type: "http"` (default) or `type: "httpApi"` in Serverless events.
- **Incremental Per-Lambda Rebuild in `fastlbs start`**:
  - File changes inside `lambdas/<name>/` now rebuild only the affected lambda in-place and skip restarting `serverless-offline` unless `serverless.yml` actually changed.

---

## [2.0.1] - 2026-10-16

### Added
- **Native Zero-Dependency i18n Engine for Lambdas (`defineI18n`, `fastlbs i18n`)**:
  - Built-in lightweight internationalization runtime (`libs/common/i18n/index.ts`) powered by native Node.js `Intl.PluralRules`, `Intl.NumberFormat`, `Intl.DateTimeFormat`, and `Intl.getCanonicalLocales` (IETF BCP 47 nomenclature).
  - Automatic per-request locale negotiation (`?lang=` query -> `X-Lang` / `X-Locale` header -> `Accept-Language` with quality weights `q=` -> `event.auth.locale` -> `defaultLocale`) with regional fallback (`es-MX` -> `es` -> `en`).
  - Strictly-typed translation helper `event.t(key, params)` with dot-notation autocomplete (`Paths<T>`), `{{var}}` interpolation, and pluralization (`_zero`, `_one`, `_other`), plus `Content-Language` response header injection.
  - Localized error responses via `HandlerErrorResponse.i18n(statusCode, messageKey, params, error)` and per-request Zod 4 validation error localization.
  - Automated OpenAPI 3.0 documentation for `Accept-Language` request header and `Content-Language` response header on i18n-enabled endpoints.
  - New `fastlbs i18n [lambda-name]` CLI command (`--locales`, `--default`, `--all`, `--check`) and `fastlbs lambda <name> --i18n` options, plus `defaultLocale` configuration in `fastlbs.config.json`.
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

