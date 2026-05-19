import { buildProject } from "../scripts/build/index.js";

export function buildProjectCommand(program) {
    program
        .command('build <lambda-name>')
                .alias('compile')
                .description('Compile one lambda to dist/<lambda>/index.js using esbuild')
                .addHelpText('after', `
Examples:
    $ fastlbs build greeting
    $ fastlbs compile users-create
`)
        .action(async (lambdaName) => {
            await buildProject(lambdaName);
        });
}