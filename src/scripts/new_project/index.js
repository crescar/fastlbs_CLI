import cliProgress from 'cli-progress';
import enquirer from 'enquirer';
import figlet from 'figlet';
import pc from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { createBaseDoc } from "./services/create_base_doc.js";
import { createBaseServerless } from "./services/create_base_serverless.js";
import { createBaseContext } from "./services/create_base_context.js";
import { createBaseI18n } from "./services/create_base_i18n.js";
import { createBaseWrapper } from "./services/create_base_wrapper.js";
import { createConfigurations } from "./services/create_configurations.js";
import { folderStructure } from "./services/create_folder_structure.js";
import { createHandlerResponses } from "./services/create_handler_responses.js";
import { createBaseMiddleware } from './services/create_base_middleware.js';
import { createValidatorBaseMiddleware } from './services/validator_base_middleware.js';
import { createZodOpenApiUtil } from './services/create_zod_openapi_util.js';
import { assertValidProjectName } from '../../utils/cli_validation.js';
import { FastlbsError } from '../../utils/cli_error.js';
import {
    SUPPORTED_PACKAGE_MANAGERS,
    assertValidPackageManager,
    assertPackageManagerInstalled,
    detectPackageManagerFromUserAgent,
    getPackageManagerVersion,
    getPackageManagerCommands,
    isYarnBerry,
} from '../../utils/package_manager.js';

const execAsync = promisify(exec);

function createBaseGitIgnore(projectRoot, { packageManager = 'npm', packageManagerVersion = null } = {}) {
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const lines = ['node_modules/', 'dist/', 'coverage/', '.env'];
    if (packageManager === 'yarn' && isYarnBerry(packageManagerVersion)) {
        lines.push('.yarn/*', '!.yarn/releases', '.pnp.*');
    }
    fs.writeFileSync(gitIgnorePath, lines.join('\n') + '\n', 'utf-8');
}

async function resolveProjectPackageManager(options = {}) {
    if (options.packageManager !== undefined) {
        return assertValidPackageManager(options.packageManager);
    }

    const detectedDefault = detectPackageManagerFromUserAgent();
    const isNonInteractive = Boolean(options.yes || !process.stdin.isTTY);
    if (isNonInteractive) {
        return detectedDefault;
    }

    const initialIndex = Math.max(0, SUPPORTED_PACKAGE_MANAGERS.indexOf(detectedDefault));
    const { packageManager } = await enquirer.prompt([
        {
            type: 'select',
            name: 'packageManager',
            message: 'Select the package manager to use for this project:',
            choices: [
                { name: 'npm', message: 'npm (Node Package Manager)' },
                { name: 'pnpm', message: 'pnpm (Fast, disk space efficient package manager)' },
                { name: 'yarn', message: 'yarn (Yarn package manager)' },
            ],
            initial: initialIndex,
        },
    ]);

    return assertValidPackageManager(Array.isArray(packageManager) ? packageManager[0] : packageManager);
}

export async function createProject(projectName, options = {}) {
    assertValidProjectName(projectName);

    const projectRoot = path.join(process.cwd(), projectName);
    if (fs.existsSync(projectRoot) && fs.readdirSync(projectRoot).length > 0) {
        throw new FastlbsError(`Directory "${projectName}" already exists and is not empty.`, {
            code: 'PROJECT_ALREADY_EXISTS',
            hint: 'Choose a different project name or run in an empty directory.',
        });
    }

    const packageManager = await resolveProjectPackageManager(options);
    const skipInstall = Boolean(options.skipInstall);
    const packageManagerVersion = skipInstall
        ? getPackageManagerVersion(packageManager)
        : assertPackageManagerInstalled(packageManager);
    const yarnBerry = packageManager === 'yarn' && isYarnBerry(packageManagerVersion);
    const pmCommands = getPackageManagerCommands(packageManager, { yarnBerry });

    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(100, 0);

    try {
        folderStructure(projectName);
        progressBar.update(20);

        createConfigurations(projectName, { packageManager, packageManagerVersion });
        progressBar.update(40);

        createBaseContext(projectName);
        createBaseI18n(projectName);
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
        createBaseGitIgnore(projectRoot, { packageManager, packageManagerVersion });

        await execAsync('git init', { cwd: projectRoot });
        if (!skipInstall) {
            try {
                await execAsync(pmCommands.installCommandString, { cwd: projectRoot });
            } catch (installError) {
                const detail = (installError?.stderr || installError?.stdout || '').trim();
                const summary = detail
                    ? detail.split(/\r?\n/).slice(-6).join('\n')
                    : installError instanceof Error
                        ? installError.message
                        : String(installError);
                throw new FastlbsError(
                    `Failed to install dependencies with "${pmCommands.installCommandString}":\n${summary}`,
                    {
                        code: 'DEPENDENCY_INSTALL_FAILED',
                        hint: `cd ${projectName} and run "${pmCommands.installCommandString}" manually to inspect full output.`,
                    }
                );
            }
        }

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
        if (skipInstall) {
            console.log(pc.yellow(`  ${pmCommands.installCommandString} (install dependencies)`));
        }
        console.log(pc.green('  fastlbs lambda <lambda-name> to create a new lambda'));
        console.log(
            pc.cyan(
                `  Package manager: ${packageManager}${packageManagerVersion ? ` (v${packageManagerVersion})` : ''}`
            )
        );
    } catch (error) {
        progressBar.stop();
        if (error instanceof FastlbsError) {
            throw error;
        }
        throw new FastlbsError(`Error creating project: ${error instanceof Error ? error.message : String(error)}`, {
            code: 'PROJECT_CREATION_FAILED',
            hint: `Check directory permissions and ${packageManager} connectivity.`,
        });
    }
}