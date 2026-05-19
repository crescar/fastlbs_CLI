import { generateMiddleware } from "../scripts/middleware/index.js";

export function createMiddleware(program) {
    program
        .command('create-middleware <middleware-name>')
                .alias('middleware')
                .description('Generate a base middleware in libs/common/middlewares with error handling')
                .addHelpText('after', `
Examples:
    $ fastlbs create-middleware auth
    $ fastlbs middleware rate-limit
`)
        .action((middlewareName) => {
            generateMiddleware(middlewareName);
        });
}