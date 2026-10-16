#!/usr/bin/env node
import fs from 'fs';
import { program } from 'commander';
import pc from 'picocolors';
import { registerNewCommand } from '../src/commands/new_project.js';
import { registerLambdaCommand } from '../src/commands/new_lambda.js';
import { registerBuildCommand } from '../src/commands/build_project.js';
import { registerStartCommand } from '../src/commands/start_project.js';
import { registerTestCommand } from '../src/commands/test_project.js';
import { registerDropCommand } from '../src/commands/drop_lambda.js';
import { registerMiddlewareCommand } from '../src/commands/create_middleware.js';
import { asFastlbsError } from '../src/utils/cli_error.js';

const packageJson = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);

program
    .name('fastlbs')
    .description('CLI to create, run, test, and manage FastLBS projects')
    .version(packageJson.version ?? '2.0.0')
    .showHelpAfterError('\nUse --help to see usage examples.')
    .addHelpText('after', `
Quick examples:
    $ fastlbs new my-api
    $ fastlbs lambda greeting
    $ fastlbs build greeting
    $ fastlbs start
    $ fastlbs start greeting
    $ fastlbs test
    $ fastlbs test greeting
    $ fastlbs drop greeting
    $ fastlbs create-middleware auth
`);

registerNewCommand(program);
registerLambdaCommand(program);
registerBuildCommand(program);
registerStartCommand(program);
registerTestCommand(program);
registerDropCommand(program);
registerMiddlewareCommand(program);

try {
    await program.parseAsync(process.argv);
} catch (error) {
    const cliError = asFastlbsError(error);
    if (cliError.code === 'OPERATION_CANCELLED') {
        console.log(pc.yellow(`\n${cliError.message}`));
        process.exit(0);
    }
    console.error(pc.red(`[${cliError.code}] ${cliError.message}`));
    if (cliError.hint) {
        console.error(pc.yellow(`Hint: ${cliError.hint}`));
    }
    process.exit(cliError.exitCode ?? 1);
}