import { buildProject } from "../scripts/build/index.js";

export function buildProjectCommand(program) {
    program
        .command('build <lambda-name>')
        .description('Build a FastLBS lambda with esbuild')
        .action(async (lambdaName) => {
            await buildProject(lambdaName);
        });
}