import { runProject } from "../scripts/run_project/index.js";
import { getRegisteredLambdaNames } from "../scripts/run_project/services/lambda_registry.js";

export function startProject(program) {
        program
        .command('start [lambda-name]')
        .description('Start the FastLBS development server')
        .action( async (lambdaName) => {
            const registeredLambdas = getRegisteredLambdaNames();
            const lambdaExists = lambdaName ? registeredLambdas.includes(lambdaName) : false;
            const targetLambda = lambdaExists ? lambdaName : undefined;
            await runProject(targetLambda);
        });
}