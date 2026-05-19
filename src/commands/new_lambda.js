import { createLambdaFunction } from "../scripts/create_lambda/index.js";

export async function newLambda(program) {
    program
        .command('lambda <lambda-name>')
                .alias('create-lambda')
                .description('Generate a new lambda with code, tests, docs, and serverless config')
                .addHelpText('after', `
Examples:
    $ fastlbs lambda greeting
    $ fastlbs create-lambda users-list
`)
        .action( async (lambdaName) => {
            await createLambdaFunction(lambdaName);
        });
}