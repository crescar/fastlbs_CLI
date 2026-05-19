import { dropLambdaFunction } from "../scripts/drop_lambda/index.js";

export function dropLambda(program) {
    program
        .command('drop <lambda-name>')
                .alias('remove')
                .description('Remove a lambda from the project (code, config, docs, and serverless function)')
                .addHelpText('after', `
Examples:
    $ fastlbs drop greeting
    $ fastlbs remove users-create
`)
        .action(async (lambdaName) => {
            await dropLambdaFunction(lambdaName);
        });
}