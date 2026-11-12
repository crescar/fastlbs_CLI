import { upgradeProjectRuntime } from '../scripts/upgrade/index.js';

export function registerUpgradeCommand(program) {
    program
        .command('upgrade')
        .description('Upgrade the project shared runtime (libs/common) and Serverless packaging to the current FastLBS CLI version')
        .option('-c, --check', 'Check which runtime files are outdated without modifying files')
        .option('--no-backup', 'Overwrite outdated runtime files without creating .bak backup files')
        .addHelpText(
            'after',
            `
Examples:
  $ fastlbs upgrade --check
  $ fastlbs upgrade
  $ fastlbs upgrade --no-backup
`
        )
        .action(async (options) => {
            await upgradeProjectRuntime(options);
        });
}
