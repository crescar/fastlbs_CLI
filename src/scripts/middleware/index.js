import fs from 'fs';
import path from 'path';

export function generateMiddleware(middlewareName) {
    const middlewareTemplate =
`import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";

export function ${middlewareName}Middleware(): HandlerMiddleware {
    return async (
        event: APIGatewayProxyEventV2,
        context: Context,
        next
    ) => {
        const start = Date.now();
        console.log("New middleware: ${middlewareName}");
        try {
            return await next();
        } catch (error) {
            console.error(
                JSON.stringify({
                level: "error",
                message: "Request failed",
                requestId: context.awsRequestId,
                durationMs: Date.now() - start,
                error:
                    error instanceof Error
                    ? error.message
                    : String(error),
                }, null, 2)
            );
        throw error instanceof HandlerErrorResponse
            ? error
            : new HandlerErrorResponse(500, "Internal error");
    }
  };
}
`
    const middlewareDir = path.join(process.cwd(), 'libs', 'common', 'middlewares');
    fs.mkdirSync(middlewareDir, { recursive: true });
    const middlewarePath = path.join(middlewareDir, `${middlewareName}.middleware.ts`);
    fs.writeFileSync(middlewarePath, middlewareTemplate, 'utf-8');
}