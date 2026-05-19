import { runProject } from "../scripts/run_project/index.js";
import { getRegisteredLambdaNames } from "../scripts/run_project/services/lambda_registry.js";
import { assertValidLambdaName } from "../utils/cli_validation.js";
import { FastlbsError } from "../utils/cli_error.js";

export function startProject(program) {
        program
        .command('start [lambda-name]')
    .alias('dev')
        .description('Start serverless-offline in development mode for one lambda or all lambdas')
    .addHelpText('after', `
Examples:
  $ fastlbs start
  $ fastlbs dev
  $ fastlbs start greeting
`)
        .action( async (lambdaName) => {
            if (!lambdaName) {
                await runProject(undefined);
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

            await runProject(lambdaName);
        });
}