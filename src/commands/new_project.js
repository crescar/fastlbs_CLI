import { createProject } from "../scripts/new_project/index.js";

export  async function newProject(program) {
    program
        .command('new <project-name>')
                .alias('init')
                .description('Create a FastLBS project scaffold and install dependencies')
                .addHelpText('after', `
Examples:
    $ fastlbs new payments-api
    $ fastlbs init inventory-service
`)
        .action( async (projectName) => {
            await createProject(projectName);
        });
}