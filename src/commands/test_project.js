import { runTests } from "../scripts/test/index.js";
import { getRegisteredLambdaNames } from "../scripts/run_project/services/lambda_registry.js";

export function testProject(program) {
        program
        .command('test [lambda-name]')
        .description('Run tests for one lambda or all project tests')
        .action( async (lambdaName) => {
            const registeredLambdas = getRegisteredLambdaNames();
            const lambdaExists = lambdaName ? registeredLambdas.includes(lambdaName) : false;
            const targetLambda = lambdaExists ? lambdaName : undefined;

            if (targetLambda) {
                console.log(`Running tests for lambda: ${targetLambda}`);
            } else {
                if (lambdaName) {
                    console.log(`Lambda ${lambdaName} not found in fastlbs.config.json. Running all project tests.`);
                } else {
                    console.log('No lambda name provided. Running all project tests.');
                }
            }

            await runTests(targetLambda);
        });
}