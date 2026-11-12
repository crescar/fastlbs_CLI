import { dropLambdaFunction } from "../scripts/drop_lambda/index.js";

export function registerDropCommand(program) {
    program
        .command('drop <lambda-name>')
        .alias('remove')
        .description('Remove a lambda from the project (code, config, docs, and serverless function)')
        .option('-y, --yes', 'Skip interactive confirmation prompt')
        .addHelpText('after', `
Examples:
    $ fastlbs drop greeting
    $ fastlbs drop greeting --yes
    $ fastlbs remove users-create
`)
        .action(async (lambdaName, options) => {
            await dropLambdaFunction(lambdaName, options);
        });
}

export { registerDropCommand as dropLambda };