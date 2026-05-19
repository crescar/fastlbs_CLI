import { runTests } from "../scripts/test/index.js";
import { getRegisteredLambdaNames } from "../scripts/run_project/services/lambda_registry.js";
import { assertValidLambdaName } from "../utils/cli_validation.js";
import { FastlbsError } from "../utils/cli_error.js";

export function testProject(program) {
        program
        .command('test [lambda-name]')
    .alias('spec')
        .description('Run Jest for one lambda or for the entire project')
    .addHelpText('after', `
Examples:
  $ fastlbs test
  $ fastlbs spec
  $ fastlbs test greeting
`)
        .action( async (lambdaName) => {
            if (!lambdaName) {
                console.log('No lambda name provided. Running all project tests.');
                await runTests(undefined);
                return;
            }

            assertValidLambdaName(lambdaName);
            const registeredLambdas = getRegisteredLambdaNames();
            if (!registeredLambdas.includes(lambdaName)) {
                throw new FastlbsError(`Lambda "${lambdaName}" not found in fastlbs.config.json.`, {
                    code: 'LAMBDA_NOT_FOUND',
                    hint: `Available lambdas: ${registeredLambdas.join(', ') || 'none'}`,
                });
            }

            console.log(`Running tests for lambda: ${lambdaName}`);
            await runTests(lambdaName);
        });
}