import fs from 'fs';
import path from 'path';

export function createBaseMiddleware(projectName) {
    const content =
`
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";

export function loggingMiddleware(): HandlerMiddleware {
    return async (
        event: APIGatewayProxyEventV2,
        context: Context,
        next
    ) => {
        const start = Date.now();
        console.log(
        JSON.stringify({
            level: "info",
            message: "Request received",
            requestId: context.awsRequestId
        }, null, 2)
        );

        try {
        const result = await next();

        console.log(
            JSON.stringify({
            level: "info",
            message: "Request completed",
            requestId: context.awsRequestId,
            statusCode: result.statusCode,
            durationMs: Date.now() - start,
            })
        );

        return result;
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
    const middlewareDir = path.join(process.cwd(), projectName, 'libs', 'common', 'middlewares');
    if (!fs.existsSync(middlewareDir)) {
        fs.mkdirSync(middlewareDir, { recursive: true });
    }
    const filePath = path.join(middlewareDir, 'logging.middleware.ts');
    fs.writeFileSync(filePath, content);
}