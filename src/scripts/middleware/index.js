import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { assertPathInsideProject, assertValidMiddlewareName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastlbsError } from '../../utils/cli_error.js';

export function generateMiddleware(middlewareName) {
    assertValidMiddlewareName(middlewareName);
    const projectRoot = getProjectRootOrThrow();

    const middlewareTemplate =
`import type { Context } from "aws-lambda";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import type { FastlbsContext } from "../context/fastlbsContext";

export function ${middlewareName}Middleware(): HandlerMiddleware {
    return async (
        event: FastlbsContext,
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
`;

    const middlewareDir = path.join(projectRoot, 'libs', 'common', 'middlewares');
    assertPathInsideProject(projectRoot, middlewareDir, 'middleware directory');
    fs.mkdirSync(middlewareDir, { recursive: true });

    const middlewarePath = path.join(middlewareDir, `${middlewareName}.middleware.ts`);
    assertPathInsideProject(projectRoot, middlewarePath, 'middleware file');

    if (fs.existsSync(middlewarePath)) {
        throw new FastlbsError(`Middleware "${middlewareName}" already exists at: ${path.relative(projectRoot, middlewarePath)}`, {
            code: 'MIDDLEWARE_ALREADY_EXISTS',
            hint: 'Choose a different name or edit the existing middleware file.',
        });
    }

    fs.writeFileSync(middlewarePath, middlewareTemplate, 'utf-8');
    console.log(pc.green(`✔ Middleware "${middlewareName}" created successfully!`));
    console.log(pc.cyan(`  File: libs/common/middlewares/${middlewareName}.middleware.ts`));
}