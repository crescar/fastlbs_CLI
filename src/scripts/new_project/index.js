import cliProgress from 'cli-progress';
import figlet from 'figlet';
import pc from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { createBaseDoc } from "./services/create_base_doc.js";
import { createBaseServerless } from "./services/create_base_serveless.js";
import { createBaseWrapper } from "./services/create_base_wapper.js";
import { createConfigurations } from "./services/create_configurations.js";
import { folderStructure } from "./services/create_folder_structure.js";
import { createHandlerResponses } from "./services/create_hanlder_responses.js";
import { createBaseMiddleware } from './services/create_base_middleware.js';

const execAsync = promisify(exec);

function createBaseGitIgnore(projectRoot) {
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const content = ['node_modules/', 'dist/', 'coverage/', '.env'].join('\n') + '\n';
    fs.writeFileSync(gitIgnorePath, content, 'utf-8');
}

export async function createProject(projectName) {
    const projectRoot = path.join(process.cwd(), projectName);
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(100, 0);
    try {
        folderStructure(projectName);
        progressBar.update(20);
        createConfigurations(projectName);
        progressBar.update(40);
        createBaseWrapper(projectName);
        createBaseMiddleware(projectName);
        progressBar.update(60);
        createHandlerResponses(projectName);
        progressBar.update(80);
        createBaseDoc(projectName);
        progressBar.update(90);
        createBaseServerless(projectName);
        createBaseGitIgnore(projectRoot);

        await execAsync('git init', { cwd: projectRoot });

        await execAsync('npm install', { cwd: projectRoot });

        progressBar.update(100);
        const figletText = await new Promise((resolve, reject) => {
            figlet(`Project ${projectName} Created!`, (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(data);
            });
        });

        console.log(figletText);
        console.log(pc.green('cd into your project and start developing!'));
        console.log(pc.green(`cd ${projectName}`));
        console.log(pc.green('fastlbs lambda <lambda-name> to create a new lambda'));
    } catch (error) {
        console.error(pc.red(`Error creating project: ${error instanceof Error ? error.message : String(error)}`));
        throw error;
    } finally {
        progressBar.stop();
    }
}