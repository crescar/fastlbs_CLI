import { createProject } from "../scripts/new_project/index.js";

export function registerNewCommand(program) {
    program
        .command('new <project-name>')
        .alias('init')
        .description('Create a FastLBS project scaffold and install dependencies')
        .option('--pm, --package-manager <pm>', 'Package manager to use: npm, pnpm, or yarn')
        .option('--skip-install', 'Scaffold the project without installing dependencies')
        .option('-y, --yes', 'Skip interactive prompts and use provided flags or defaults')
        .addHelpText('after', `
Examples:
    $ fastlbs new payments-api
    $ fastlbs new payments-api --package-manager pnpm
    $ fastlbs new payments-api --pm yarn --skip-install
    $ fastlbs init inventory-service
`)
        .action(async (projectName, options) => {
            await createProject(projectName, options);
        });
}

export { registerNewCommand as newProject };