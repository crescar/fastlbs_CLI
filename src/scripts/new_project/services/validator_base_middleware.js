import fs from 'fs';
import path from 'path';

export function createValidatorBaseMiddleware(projectName) {
    const content =
`/* @fastlbs-i18n v1 */
import type { Context } from "aws-lambda";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import type { FastlbsContext } from "../context/fastlbsContext";
import { z, type ZodType } from "zod";

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

function resolveZodParseOptions(locale?: string): Record<string, any> | undefined {
    if (!locale || typeof locale !== "string") return undefined;
    try {
        const localesMap = (z as any)?.locales;
        if (!localesMap || typeof localesMap !== "object") return undefined;
        const baseLang = locale.split("-")[0].toLowerCase();
        const localeFactory = localesMap[locale] || localesMap[baseLang];
        if (typeof localeFactory === "function") {
            const localeConfig = localeFactory();
            if (localeConfig?.localeError) {
                return { error: localeConfig.localeError };
            }
        }
    } catch {
        // Fallback to built-in FastLBS Zod issue translator
    }
    return undefined;
}

function resolveZodIssueKey(issue: any): string | undefined {
    const code = issue?.code;
    if (code === "invalid_type") {
        if (issue?.received === "undefined" || issue?.input === undefined) {
            return "common.validation.zod.required";
        }
        return "common.validation.zod.invalidType";
    }
    if (code === "invalid_string" || code === "invalid_format") {
        const format = issue?.validation || issue?.format;
        if (format === "email") return "common.validation.zod.invalidEmail";
        if (format === "uuid") return "common.validation.zod.invalidUuid";
        if (format === "url") return "common.validation.zod.invalidUrl";
        return "common.validation.zod.invalidString";
    }
    if (code === "too_small") {
        const origin = issue?.type || issue?.origin;
        if (origin === "string") return "common.validation.zod.tooSmallString";
        if (origin === "array") return "common.validation.zod.tooSmallArray";
        return "common.validation.zod.tooSmallNumber";
    }
    if (code === "too_big") {
        const origin = issue?.type || issue?.origin;
        if (origin === "string") return "common.validation.zod.tooBigString";
        if (origin === "array") return "common.validation.zod.tooBigArray";
        return "common.validation.zod.tooBigNumber";
    }
    if (code === "invalid_enum_value" || code === "invalid_value") {
        return "common.validation.zod.invalidEnum";
    }
    return undefined;
}

function formatLocalizedZodIssue(event: FastlbsContext, issue: any): string {
    const field = Array.isArray(issue?.path) && issue.path.length > 0
        ? issue.path.join(".")
        : "value";
    const optionsList = Array.isArray(issue?.options)
        ? issue.options.join(", ")
        : Array.isArray(issue?.values)
        ? issue.values.join(", ")
        : "";
    const params: Record<string, unknown> = {
        field,
        expected: issue?.expected ?? "",
        received: issue?.received ?? typeof issue?.input,
        minimum: issue?.minimum,
        maximum: issue?.maximum,
        validation: issue?.validation ?? issue?.format ?? "value",
        options: optionsList,
    };

    const translate = typeof (event as any)?.t === "function"
        ? (event as any).t.bind(event)
        : null;

    if (translate) {
        // 1. If the developer passed a custom i18n key in the Zod schema (e.g. z.string().min(3, "validation.nameTooShort"))
        if (typeof issue?.message === "string" && issue.message.trim()) {
            const customTranslated = translate(issue.message, params);
            if (customTranslated && customTranslated !== issue.message) {
                return \`\${field}: \${customTranslated}\`;
            }
        }

        // 2. Automatic translation by Zod issue code via common.validation.zod.*
        const autoKey = resolveZodIssueKey(issue);
        if (autoKey) {
            const autoTranslated = translate(autoKey, params);
            if (autoTranslated && autoTranslated !== autoKey) {
                return \`\${field}: \${autoTranslated}\`;
            }
        }
    }

    return \`\${field}: \${issue?.message || "Invalid value"}\`;
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
                    throw new HandlerErrorResponse(
                        400,
                        "Invalid JSON in request body",
                        undefined,
                        { messageKey: "common.validation.invalidJson" }
                    );
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

        const parseOpts = resolveZodParseOptions((event as any)?.locale);
        const result = parseOpts
            ? (schema as any).safeParse(dataToValidate, parseOpts)
            : schema.safeParse(dataToValidate);
        if (!result.success) {
            const errors = result.error.issues.map((issue: any) =>
                formatLocalizedZodIssue(event, issue)
            );
            throw new HandlerErrorResponse(
                400,
                "Invalid request",
                errors,
                { messageKey: "common.validation.invalidRequest" }
            );
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
