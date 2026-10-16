import cliProgress from 'cli-progress';
import figlet from 'figlet';
import pc from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { createBaseDoc } from "./services/create_base_doc.js";
import { createBaseServerless } from "./services/create_base_serverless.js";
import { createBaseContext } from "./services/create_base_context.js";
import { createBaseWrapper } from "./services/create_base_wrapper.js";
import { createConfigurations } from "./services/create_configurations.js";
import { folderStructure } from "./services/create_folder_structure.js";
import { createHandlerResponses } from "./services/create_handler_responses.js";
import { createBaseMiddleware } from './services/create_base_middleware.js';
import { createValidatorBaseMiddleware } from './services/validator_base_middleware.js';
import { createZodOpenApiUtil } from './services/create_zod_openapi_util.js';
import { assertValidProjectName } from '../../utils/cli_validation.js';
import { FastlbsError } from '../../utils/cli_error.js';

const execAsync = promisify(exec);

function createBaseGitIgnore(projectRoot) {
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const content = ['node_modules/', 'dist/', 'coverage/', '.env'].join('\n') + '\n';
    fs.writeFileSync(gitIgnorePath, content, 'utf-8');
}

export async function createProject(projectName) {
    assertValidProjectName(projectName);

    const projectRoot = path.join(process.cwd(), projectName);
    if (fs.existsSync(projectRoot) && fs.readdirSync(projectRoot).length > 0) {
        throw new FastlbsError(`Directory "${projectName}" already exists and is not empty.`, {
            code: 'PROJECT_ALREADY_EXISTS',
            hint: 'Choose a different project name or run in an empty directory.',
        });
    }

    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(100, 0);

    try {
        folderStructure(projectName);
        progressBar.update(20);

        createConfigurations(projectName);
        progressBar.update(40);

        createBaseContext(projectName);
        createBaseWrapper(projectName);
        createBaseMiddleware(projectName);
        createValidatorBaseMiddleware(projectName);
        progressBar.update(60);

        createHandlerResponses(projectName);
        createZodOpenApiUtil(projectName);
        progressBar.update(80);

        createBaseDoc(projectName);
        progressBar.update(90);

        createBaseServerless(projectName);
        createBaseGitIgnore(projectRoot);

        await execAsync('git init', { cwd: projectRoot });
        await execAsync('npm install', { cwd: projectRoot });

        progressBar.update(100);
        progressBar.stop();

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
        console.log(pc.green(`  cd ${projectName}`));
        console.log(pc.green('  fastlbs lambda <lambda-name> to create a new lambda'));
    } catch (error) {
        progressBar.stop();
        if (error instanceof FastlbsError) {
            throw error;
        }
        throw new FastlbsError(`Error creating project: ${error instanceof Error ? error.message : String(error)}`, {
            code: 'PROJECT_CREATION_FAILED',
            hint: 'Check directory permissions and npm connectivity.',
        });
    }
}