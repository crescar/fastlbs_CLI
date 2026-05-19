import { dropLambdaFunction } from "../scripts/drop_lambda/index.js";

export function dropLambda(program) {
    program
        .command('drop <lambda-name>')
        .description('Drop a FastLBS lambda')
        .action(async (lambdaName) => {
            await dropLambdaFunction(lambdaName);
        });
}