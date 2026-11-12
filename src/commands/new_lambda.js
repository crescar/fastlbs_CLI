import { createLambdaFunction } from "../scripts/create_lambda/index.js";

export function registerLambdaCommand(program) {
    program
        .command('lambda <lambda-name>')
        .alias('create-lambda')
        .description('Generate a new lambda with code, tests, docs, and serverless config')
        .option('-k, --kind <kind>', 'Lambda type: http, authorizer, or auxiliary')
        .option('-m, --method <method>', 'HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS')
        .option('-p, --path <route>', 'Route path without version prefix (e.g. /users/{id})')
        .option('-v, --api-version <version>', 'API version prefix (e.g. v1)')
        .option('--authorizer <name>', 'Name of an Authorizer Lambda to protect this endpoint')
        .option('--before <name>', 'Name of an Auxiliary Lambda to run before this endpoint')
        .option('--api-gateway <type>', 'API Gateway event type: http (REST v1) or httpApi (HTTP v2)')
        .option('--i18n', 'Enable native i18n support and generate locale files for this lambda')
        .option('--no-i18n', 'Skip i18n generation without prompting')
        .option('-l, --locales <locales>', 'Comma-separated BCP 47 locale codes (e.g. en,es,pt-BR)')
        .option('--default-locale <locale>', 'Default BCP 47 locale code for this lambda')
        .option('-y, --yes', 'Skip all interactive prompts and use provided flags or defaults')
        .addHelpText('after', `
Examples:
    $ fastlbs lambda greeting
    $ fastlbs lambda greeting --i18n --locales en,es
    $ fastlbs lambda users --kind http --method POST --path /users --api-version v1 --yes
    $ fastlbs lambda auth --kind authorizer --yes
`)
        .action(async (lambdaName, options) => {
            await createLambdaFunction(lambdaName, options);
        });
}

export { registerLambdaCommand as newLambda };
