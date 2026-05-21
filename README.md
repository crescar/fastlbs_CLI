#  FastLBS CLI <img src="./assets/logo.png" alt="FastLBS Logo" width="136" height="74" style="vertical-align:middle;">

FastLBS is a CLI focused on AWS Lambda development with TypeScript. It scaffolds project structure, creates lambdas with tests and docs, runs local development with Serverless Offline, and compiles lambdas into deployable JavaScript artifacts.

## What This CLI Does

FastLBS helps you standardize and accelerate the full lambda lifecycle:

- Create a ready-to-work project structure for AWS Lambda.
- Generate lambdas with base code, Jest tests, docs, and serverless function config.
- Run local development quickly.
- Build lambdas with esbuild into optimized JavaScript outputs.
- Keep API documentation lambda (`__doc__`) integrated into the workflow.

When you create a new project, two base middlewares are generated automatically: one for logging and one for validation with Zod. See the section "Base Middlewares" below for details and usage examples.

## Base Middlewares

When you create a new project with FastLBS, two base middlewares are automatically included:

- `loggingMiddleware`: Logs information for each request and response.
- `validatorMiddleware`: Validates input data using Zod schemas.

### Example: How to use the middlewares

You can use the middlewares in your handlers as shown below (real example based on a generated handler):

```typescript
import {
    handlerResponse
} from "@validatorMiddleware/common/wrappers/handlerResponse.wrapper";

import { loggingMiddleware } from "@validatorMiddleware/common/middlewares/logging.middleware";
import { HandlerStandardResponse } from "@validatorMiddleware/common/utils/handlerStandardResponse.util";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { validatorMiddleware, ValidationOptions } from "@validatorMiddleware/common/middlewares/validator.middleware";
import { z } from "zod";

type GreetingData = {
    greeting: string;
};

const requestSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
    lastName: z.string().min(1, "Last name is required").max(100, "Last name must be less than 100 characters"),
});

type RequestData = z.infer<typeof requestSchema>;

async function service(
    _event: APIGatewayProxyEventV2,
    _context: Context
): Promise<HandlerStandardResponse<GreetingData>> {
    const requestData: RequestData = _event.body ? JSON.parse(_event.body) : {};
    const { name, lastName } = requestData;
    return new HandlerStandardResponse<GreetingData>(200, {
        message: "Request successful",
        status: "success",
        data: {
            greeting: `Hello, ${name} ${lastName}! from Lambda greeting`,
        },
    });
}

export const handler = handlerResponse(
    loggingMiddleware(),
    validatorMiddleware(
        requestSchema,
        ValidationOptions.BODY
    ),
    service,
);
```

You can chain as many middlewares as you need, always wrapping your main function.

## Special `__doc__` Lambda

FastLBS includes a special lambda named `__doc__`.

This lambda is intended to expose and serve your API documentation using Swagger/OpenAPI. It works as a dedicated documentation endpoint inside the project and is part of the normal build/deployment workflow.

### What it is for

- Serve Swagger/OpenAPI documentation for your lambdas.
- Centralize API path definitions in one place.
- Keep documentation deployable together with the rest of the project.

### How it works

- The documentation source lives inside the `__doc__` lambda files.
- Route/path documentation can be defined manually in JSON-style structures.
- Generated lambda docs can be extended or adjusted manually at any time.

### Important detail

The `__doc__` lambda is fully editable. You can customize the Swagger/OpenAPI document as much as you want, including:

- titles
- descriptions
- tags
- responses
- schemas
- security definitions
- custom paths or manual documentation entries

In other words, FastLBS gives you a starting point, but the `__doc__` lambda remains completely under your control.

## Why Use FastLBS

FastLBS is useful when you want consistency, speed, and fewer manual steps.

### Development improvements

- Faster onboarding: new developers can create a project and first lambda in minutes.
- Less repetitive work: common files, wrappers, middleware, docs, and tests are generated.
- Standardized structure: all lambdas follow the same conventions.
- Safer iteration: built-in test and local run workflows reduce integration mistakes.
- Better automation readiness: build output is artifact-friendly for CI/CD.

### Operational benefits

- Build artifacts are compiled JavaScript, ready for Node.js runtime on AWS.
- You can deploy with Serverless Framework or your own artifact pipeline.
- Since code is bundled/minified, AWS does not need your local development setup.

## Installation

Global installation:

```bash
npm install -g fastlbs
```

Local usage in this repository:

```bash
npm install
node ./bin/fastlbs.js --help
```

## Quick Start

```bash
fastlbs new my-api
cd my-api
fastlbs lambda greeting
fastlbs test greeting
fastlbs build greeting
fastlbs start
```

## Commands

```bash
fastlbs new <project-name>
fastlbs lambda <lambda-name>
fastlbs build <lambda-name>
fastlbs start [lambda-name]
fastlbs test [lambda-name]
fastlbs drop <lambda-name>
fastlbs create-middleware <middleware-name>
```

## Recommended Development Flow

1. Create project scaffold.
2. Create one or more lambdas.
3. Run tests locally.
4. Build lambdas to `dist/`.
5. Run and validate with Serverless Offline.
6. Deploy compiled artifacts to AWS.

## Deployment Options

You can deploy in two common ways.

### Option 1: Deploy with Serverless Framework

Use generated `serverlessConfig` + `serverless.yml` flow.

In FastLBS, Serverless is primarily used as a local development environment to emulate AWS behavior on your machine. This helps teams develop and validate lambdas locally before deployment.

FastLBS generates only a base Serverless configuration as a starting point. From there, the configuration can be expanded and used explicitly across the whole project according to your infrastructure, events, plugins, stages, and deployment strategy.

Typical approach:

1. Build target lambda(s) and `__doc__`.
2. Generate/update serverless definitions.
3. Run `serverless deploy` in your deployment process.

This is usually the fastest way when your team already uses Serverless Framework.

### Option 2: Deploy compiled artifacts directly (custom pipeline)

If you use custom CI/CD or platform pipelines:

1. Detect changed lambdas from git diff.
2. Always include `__doc__` plus changed lambdas in the build set.
3. Compile each target lambda to `dist/<lambda>/index.js`.
4. Zip compiled outputs.
5. Publish/update Lambda code in AWS.
6. Update events/triggers from your IaC or deployment system.

Example pipeline behavior:

- Pipeline detects changes in `lambdas/*`.
- Pipeline compiles `__doc__` and each changed lambda.
- Pipeline compresses compiled outputs.
- Pipeline deploys code and exposes/update configured events in AWS.

## Important Note About AWS Runtime Dependencies

With this workflow, AWS executes the compiled JavaScript artifacts. In most setups, you do not need to ship your full development environment to AWS.

- You typically do not need to install npm dependencies directly on AWS runtime environments.
- You do not need to send your full project source for execution.
- Build pipeline produces the deployable output in `dist/`.

In short: development happens in TypeScript, deployment happens with compiled Node.js artifacts.

## Creator

- Luis Crespo
- GitHub: https://github.com/crescar
- Email: crescar64@gmail.com

## License

MIT
