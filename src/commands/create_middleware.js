import { generateMiddleware } from "../scripts/middleware/index.js";
import { assertValidMiddlewareName } from "../utils/cli_validation.js";

export function registerMiddlewareCommand(program) {
    program
        .command('create-middleware <middleware-name>')
        .alias('middleware')
        .description('Generate a base middleware in libs/common/middlewares with error handling')
        .addHelpText('after', `
Examples:
    $ fastlbs create-middleware auth
    $ fastlbs middleware rate-limit
`)
        .action(async (middlewareName) => {
            assertValidMiddlewareName(middlewareName);
            generateMiddleware(middlewareName);
        });
}

export { registerMiddlewareCommand as createMiddleware };