import { buildProject } from "../scripts/build/index.js";

export function registerBuildCommand(program) {
    program
        .command('build <lambda-name>')
        .alias('compile')
        .option('-t, --type <strategy>', 'Build strategy: "bundle" (single-file) or "modular" (with package.json)')
        .description('Compile one lambda to dist/<lambda>/index.js using esbuild')
        .addHelpText('after', `
Examples:
    $ fastlbs build greeting
    $ fastlbs build greeting --type bundle
    $ fastlbs build greeting --type modular
    $ fastlbs compile users-create -t modular
`)
        .action(async (lambdaName, options) => {
            await buildProject(lambdaName, { type: options.type });
        });
}

export { registerBuildCommand as buildProjectCommand };