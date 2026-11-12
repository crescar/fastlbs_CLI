import { manageI18nCommand } from '../scripts/i18n/index.js';

export function registerI18nCommand(program) {
    program
        .command('i18n [lambda-name]')
        .alias('localize')
        .description('Add, update, or validate native i18n translations for a Lambda function or the entire project')
        .option(
            '-l, --locales <locales>',
            'Comma-separated IETF BCP 47 locale tags to generate or add (e.g. en,es,pt-BR)'
        )
        .option(
            '-d, --default <locale>',
            'Default locale for the lambda or project (updates fastlbs.config.json when run without a lambda name)'
        )
        .option('-a, --all', 'Add or update i18n across all lambdas in the project')
        .option(
            '-c, --check',
            'Validate that all locale JSON files have identical keys and {{placeholder}} variables'
        )
        .addHelpText(
            'after',
            `
Examples:
  $ fastlbs i18n greeting
  $ fastlbs i18n greeting --locales en,es,pt --default es
  $ fastlbs i18n --default es
  $ fastlbs i18n --all --locales en,es
  $ fastlbs i18n --check
  $ fastlbs i18n greeting --check
`
        )
        .action(async (lambdaName, options) => {
            await manageI18nCommand(lambdaName, options);
        });
}
