import fs from 'fs';
import path from 'path';

export function createValidatorBaseMiddleware(projectName) {
    const errors = "`${issue.path.join('.')}: ${issue.message}`";
    const content =
`import type { Context } from "aws-lambda";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import type { FastlbsContext } from "../context/fastlbsContext";
import { ZodType } from "zod";

export enum ValidationOptions {
    BODY = "BODY",
    QUERYPARAMS = "QUERYPARAMS",
    PATHPARAMS = "PATHPARAMS",
    HEADERS = "HEADERS",
    PAYLOAD = "PAYLOAD",
}

export interface ValidatorMiddlewareMeta {
    __fastlbsValidator: true;
    schema: ZodType;
    option: ValidationOptions;
}

export function validatorMiddleware(
    schema: ZodType,
    option: ValidationOptions = ValidationOptions.BODY
): HandlerMiddleware & { __fastlbsValidator?: ValidatorMiddlewareMeta } {
    const middleware: HandlerMiddleware & { __fastlbsValidator?: ValidatorMiddlewareMeta } = async (
        event: FastlbsContext,
        _context: Context,
        next
    ) => {
        let dataToValidate: unknown;
        switch (option) {
            case ValidationOptions.BODY:
                try {
                    dataToValidate = event.body ? JSON.parse(event.body) : {};
                } catch {
                    throw new HandlerErrorResponse(400, "Invalid JSON in request body");
                }
                break;
            case ValidationOptions.QUERYPARAMS:
                dataToValidate = event.queryStringParameters || {};
                break;
            case ValidationOptions.PATHPARAMS:
                dataToValidate = event.pathParameters || {};
                break;
            case ValidationOptions.HEADERS:
                dataToValidate = event.headers || {};
                break;
            case ValidationOptions.PAYLOAD:
                dataToValidate = event.getPayload ? event.getPayload() : (event.payload || {});
                break;
            default:
                dataToValidate = event.body || {};
        }

        const result = schema.safeParse(dataToValidate);
        if (!result.success) {
            const errors = result.error.issues.map(issue => ${errors});
            throw new HandlerErrorResponse(400, "Invalid request", errors);
        }
        return await next();
    };

    middleware.__fastlbsValidator = {
        __fastlbsValidator: true,
        schema,
        option,
    };

    return middleware;
}
`;
    const middlewareDir = path.join(process.cwd(), projectName, 'libs', 'common', 'middlewares');
    if (!fs.existsSync(middlewareDir)) {
        fs.mkdirSync(middlewareDir, { recursive: true });
    }
    const filePath = path.join(middlewareDir, 'validator.middleware.ts');
    fs.writeFileSync(filePath, content, 'utf-8');
}