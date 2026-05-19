import { createProject } from "../scripts/new_project/index.js";

export  async function newProject(program) {
    program
        .command('new <project-name>')
        .description('Create a new FastLBS project')
        .action( async (projectName) => {
            await createProject(projectName);
        });
}