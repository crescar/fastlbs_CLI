import { createLambdaFunction } from "../scripts/create_lambda/index.js";

export async function newLambda(program) {
    program
        .command('lambda <lambda-name>')
        .description('Create a new FastLBS lambda')
        .action( async (lambdaName) => {
            await createLambdaFunction(lambdaName);
        });
}