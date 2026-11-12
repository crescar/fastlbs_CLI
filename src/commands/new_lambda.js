import { createLambdaFunction } from "../scripts/create_lambda/index.js";

export function registerLambdaCommand(program) {
    program
        .command('lambda <lambda-name>')
        .alias('create-lambda')
        .description('Generate a new lambda with code, tests, docs, and serverless config')
        .option('--i18n', 'Enable native i18n support and generate locale files for this lambda')
        .option('--no-i18n', 'Skip i18n generation without prompting')
        .option('-l, --locales <locales>', 'Comma-separated BCP 47 locale codes (e.g. en,es,pt-BR)')
        .option('--default-locale <locale>', 'Default BCP 47 locale code for this lambda')
        .addHelpText('after', `
Examples:
    $ fastlbs lambda greeting
    $ fastlbs lambda greeting --i18n --locales en,es
    $ fastlbs create-lambda users-list --no-i18n
`)
        .action(async (lambdaName, options) => {
            await createLambdaFunction(lambdaName, options);
        });
}

export { registerLambdaCommand as newLambda };
