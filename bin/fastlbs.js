#!/usr/bin/env node
import { program } from 'commander';
import { buildProjectCommand } from '../src/commands/build_project.js';
import { newProject } from '../src/commands/new_project.js';
import { newLambda } from '../src/commands/new_lambda.js';
import { startProject } from '../src/commands/start_project.js';
import { testProject } from '../src/commands/test_project.js';
import { dropLambda } from '../src/commands/drop_lambda.js';
import { createMiddleware } from '../src/commands/create_middleware.js';

program
    .name('fastlbs')
    .description('A CLI tool for FastLBS')
    .version('1.0.0');

newProject(program);
newLambda(program);
buildProjectCommand(program);
startProject(program);
testProject(program);
dropLambda(program);
createMiddleware(program);
program.parse(process.argv);