#!/usr/bin/env node
import { program } from 'commander';
import pc from 'picocolors';
import { buildProjectCommand } from '../src/commands/build_project.js';
import { newProject } from '../src/commands/new_project.js';
import { newLambda } from '../src/commands/new_lambda.js';
import { startProject } from '../src/commands/start_project.js';
import { testProject } from '../src/commands/test_project.js';
import { dropLambda } from '../src/commands/drop_lambda.js';
import { createMiddleware } from '../src/commands/create_middleware.js';
import { asFastlbsError } from '../src/utils/cli_error.js';

program
    .name('fastlbs')
        .description('CLI to create, run, test, and manage FastLBS projects')
        .version('1.0.0')
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
`);

newProject(program);
newLambda(program);
buildProjectCommand(program);
startProject(program);
testProject(program);
dropLambda(program);
createMiddleware(program);

try {
    await program.parseAsync(process.argv);
} catch (error) {
    const cliError = asFastlbsError(error);
    console.error(pc.red(`[${cliError.code}] ${cliError.message}`));
    if (cliError.hint) {
        console.error(pc.yellow(`Hint: ${cliError.hint}`));
    }
    process.exit(cliError.exitCode ?? 1);
}