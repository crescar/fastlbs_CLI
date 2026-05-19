import { generateMiddleware } from "../scripts/middleware/index.js";

export function createMiddleware(program) {
    program
        .command('create-middleware <middleware-name>')
        .description('Create a new FastLBS middleware')
        .action((middlewareName) => {
            generateMiddleware(middlewareName);
        });
}