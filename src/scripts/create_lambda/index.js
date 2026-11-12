import enquirer from 'enquirer';
import pc from 'picocolors';
import { existLambda } from './services/exist_lambda.js';
import { createLambda } from './services/create_lambda.js';
import {
    updateFastLbsConfigJson,
    getProjectAuxiliaryLambdas,
} from './services/update_fastlbs_config_json.js';
import { createBaseDoc } from './services/create_base_doc.js';
import { createFunction } from './services/create_function.js';
import { autoGenerateServerless } from '../serverless/index.js';
import { assertValidLambdaName } from '../../utils/cli_validation.js';
import { FastlbsError } from '../../utils/cli_error.js';
import { findProjectRoot } from '../../utils/project_context.js';
import {
    getProjectI18nConfig,
    resolveI18nSettings,
    ensureProjectI18nSupport,
} from '../../services/i18n/i18n_scaffolder.js';

async function promptOrResolveI18n(projectRoot, cliOptions = {}, isNonInteractive = false) {
    const projectI18n = getProjectI18nConfig(projectRoot);

    // If --no-i18n was passed explicitly (`cliOptions.i18n === false`)
    if (cliOptions.i18n === false) {
        return null;
    }

    let enableI18n = Boolean(cliOptions.i18n || cliOptions.locales || cliOptions.defaultLocale);

    if (!enableI18n && cliOptions.i18n === undefined) {
        if (isNonInteractive) {
            enableI18n = Boolean(projectI18n.enabledByDefault);
        } else {
            const { wantI18n } = await enquirer.prompt([
                {
                    type: 'confirm',
                    name: 'wantI18n',
                    message: 'Enable i18n (multi-language responses) for this lambda?',
                    initial: Boolean(projectI18n.enabledByDefault),
                },
            ]);
            enableI18n = Boolean(wantI18n);
        }
    }

    if (!enableI18n) {
        return null;
    }

    let rawLocales = cliOptions.locales;
    if (!rawLocales) {
        if (isNonInteractive) {
            rawLocales = projectI18n.locales.join(',');
        } else {
            const { localesInput } = await enquirer.prompt([
                {
                    type: 'input',
                    name: 'localesInput',
                    message: 'Supported locales (comma-separated IETF BCP 47 tags):',
                    initial: projectI18n.locales.join(','),
                },
            ]);
            rawLocales = localesInput || projectI18n.locales.join(',');
        }
    }

    const i18nConfig = resolveI18nSettings(projectRoot, {
        locales: rawLocales,
        defaultLocale: cliOptions.defaultLocale,
    });

    await ensureProjectI18nSupport(projectRoot, {
        locales: i18nConfig.locales,
        defaultLocale: i18nConfig.defaultLocale,
        interactive: !isNonInteractive,
    });

    return i18nConfig;
}

export async function createLambdaFunction(lambdaName, cliOptions = {}) {
    assertValidLambdaName(lambdaName);

    const { fileNotFound, exists } = existLambda(lambdaName);
    if (fileNotFound) {
        throw new FastlbsError('fastlbs.config.json not found in current directory or parent directories.', {
            code: 'PROJECT_CONFIG_NOT_FOUND',
            hint: 'Make sure you are running this command inside a FastLBS project.',
        });
    }

    if (exists) {
        throw new FastlbsError(`Lambda "${lambdaName}" already exists. Please choose a different name.`, {
            code: 'LAMBDA_ALREADY_EXISTS',
            hint: `Use "fastlbs drop ${lambdaName}" first if you want to replace it.`,
        });
    }

    const projectRoot = findProjectRoot() || process.cwd();
    const isNonInteractive = Boolean(cliOptions.yes || !process.stdin.isTTY);

    let kind = cliOptions.kind ? String(cliOptions.kind).toLowerCase().trim() : null;
    if (kind && !['http', 'authorizer', 'auxiliary'].includes(kind)) {
        throw new FastlbsError(`Invalid lambda kind "${cliOptions.kind}".`, {
            code: 'INVALID_LAMBDA_KIND',
            hint: 'Allowed values for --kind are: http, authorizer, auxiliary.',
        });
    }

    if (!kind) {
        if (isNonInteractive || cliOptions.method || cliOptions.path) {
            kind = 'http';
        } else {
            const { lambdaKind } = await enquirer.prompt([
                {
                    type: 'select',
                    name: 'lambdaKind',
                    message: 'Select the type of Lambda function to generate:',
                    choices: [
                        {
                            name: 'http',
                            message: 'HTTP / REST Endpoint (API Gateway + Swagger Docs)',
                            value: 'http',
                        },
                        {
                            name: 'authorizer',
                            message: 'Authorizer / Authentication Lambda (Runs before HTTP Lambdas)',
                            value: 'authorizer',
                        },
                        {
                            name: 'auxiliary',
                            message: 'Auxiliary / General-Purpose Lambda (Internal / Worker / Pre-hook)',
                            value: 'auxiliary',
                        },
                    ],
                    initial: 0,
                },
            ]);
            kind = Array.isArray(lambdaKind) ? lambdaKind[0] : lambdaKind;
        }
    }

    if (kind === 'authorizer' || kind === 'auxiliary') {
        const i18nConfig = await promptOrResolveI18n(projectRoot, cliOptions, isNonInteractive);

        createLambda(lambdaName, null, null, { kind, i18n: i18nConfig });
        updateFastLbsConfigJson(
            lambdaName,
            kind,
            i18nConfig ? { i18n: i18nConfig } : {}
        );
        createFunction(lambdaName, null, null, { kind });
        autoGenerateServerless();

        const label =
            kind === 'authorizer'
                ? 'Authorizer (Authentication) Lambda'
                : 'Auxiliary (General-Purpose) Lambda';

        console.log(pc.green(`✔ ${label} "${lambdaName}" created successfully!`));
        console.log(pc.cyan(`  Handler: lambdas/${lambdaName}/src/index.ts`));
        console.log(pc.cyan(`  Schemas: lambdas/${lambdaName}/src/schemas/index.ts`));
        console.log(pc.cyan(`  Service: lambdas/${lambdaName}/src/services/index.ts`));
        if (i18nConfig) {
            console.log(
                pc.cyan(
                    `  i18n:    lambdas/${lambdaName}/src/i18n/index.ts (${i18nConfig.locales.join(', ')}, default: ${i18nConfig.defaultLocale})`
                )
            );
        }
        if (kind === 'authorizer') {
            console.log(
                pc.yellow(
                    `  Tip: Link it to any HTTP Lambda via event: { authorizer: "${lambdaName}" } to automatically authenticate and populate event.getAuthUser()`
                )
            );
        }
        return;
    }

    const { authorizers, auxiliaries } = getProjectAuxiliaryLambdas();
    const hasAllHttpCliFlags = Boolean(
        isNonInteractive || (cliOptions.method && cliOptions.path)
    );

    let method = cliOptions.method ? String(cliOptions.method).toLowerCase().trim() : null;
    let version = cliOptions.apiVersion ? String(cliOptions.apiVersion).trim() : null;
    let route = cliOptions.path ? String(cliOptions.path).trim() : null;
    let selectedAuthorizer = cliOptions.authorizer || null;
    let selectedAuxiliary = cliOptions.before || null;

    if (!hasAllHttpCliFlags) {
        const httpQuestions = [];
        if (!method) {
            httpQuestions.push({
                type: 'select',
                name: 'methods',
                message: 'Select the HTTP method to be supported by the Lambda function: ',
                choices: [
                    { name: 'GET', value: 'get' },
                    { name: 'POST', value: 'post' },
                    { name: 'PUT', value: 'put' },
                    { name: 'DELETE', value: 'delete' },
                    { name: 'PATCH', value: 'patch' },
                    { name: 'HEAD', value: 'head' },
                    { name: 'OPTIONS', value: 'options' },
                ],
                initial: 0,
            });
        }
        if (!version) {
            httpQuestions.push({
                type: 'input',
                name: 'version',
                message: 'Enter the version for your lambda:',
                default: 'v1',
            });
        }
        if (!route) {
            httpQuestions.push({
                type: 'input',
                name: 'route',
                message: 'Enter the route for your lambda (without version prefix):',
                default: `/${lambdaName}`,
            });
        }

        if (!selectedAuthorizer && authorizers.length > 0) {
            httpQuestions.push({
                type: 'select',
                name: 'selectedAuthorizer',
                message: 'Select an Authorizer Lambda to run before this endpoint (optional):',
                choices: [
                    { name: 'none', message: 'None (Public endpoint)', value: 'none' },
                    ...authorizers.map((authName) => ({
                        name: authName,
                        message: `${authName} (Auto-authenticate & inject event.getAuthUser())`,
                        value: authName,
                    })),
                ],
                initial: 0,
            });
        }

        if (!selectedAuxiliary && auxiliaries.length > 0) {
            httpQuestions.push({
                type: 'select',
                name: 'selectedAuxiliary',
                message: 'Select an Auxiliary Lambda to run before this endpoint (optional):',
                choices: [
                    { name: 'none', message: 'None', value: 'none' },
                    ...auxiliaries.map((auxName) => ({
                        name: auxName,
                        message: `${auxName} (Pre-execution auxiliary hook)`,
                        value: auxName,
                    })),
                ],
                initial: 0,
            });
        }

        const response = httpQuestions.length > 0 ? await enquirer.prompt(httpQuestions) : {};
        if (!method) {
            method = Array.isArray(response.methods) ? response.methods[0] : response.methods;
        }
        if (!version) {
            version = response.version || 'v1';
        }
        if (!route) {
            route = response.route || `/${lambdaName}`;
        }
        if (!selectedAuthorizer) {
            selectedAuthorizer = response.selectedAuthorizer;
        }
        if (!selectedAuxiliary) {
            selectedAuxiliary = response.selectedAuxiliary;
        }
    }

    method = (method || 'get').toLowerCase();
    version = version || 'v1';
    route = route || `/${lambdaName}`;

    const i18nConfig = await promptOrResolveI18n(projectRoot, cliOptions, isNonInteractive);

    const authorizer =
        selectedAuthorizer && selectedAuthorizer !== 'none' ? selectedAuthorizer : null;
    const beforeAux =
        selectedAuxiliary && selectedAuxiliary !== 'none' ? selectedAuxiliary : null;

    if (!route.startsWith('/')) {
        route = '/' + route;
    }

    const fullPath = `${version}${route}`;
    const apiGateway = cliOptions.apiGateway === 'httpApi' ? 'httpApi' : 'http';
    createLambda(lambdaName, fullPath, method, {
        kind: 'http',
        authorizer,
        beforeAux,
        i18n: i18nConfig,
    });
    updateFastLbsConfigJson(
        lambdaName,
        'http',
        i18nConfig ? { i18n: i18nConfig } : {}
    );

    createFunction(lambdaName, fullPath, method, {
        kind: 'http',
        authorizer,
        apiGateway,
    });
    createBaseDoc(lambdaName, `/${fullPath}`, method);
    autoGenerateServerless();

    console.log(pc.green(`✔ Lambda "${lambdaName}" created successfully!`));
    console.log(pc.cyan(`  Handler: lambdas/${lambdaName}/src/index.ts`));
    console.log(pc.cyan(`  Schemas: lambdas/${lambdaName}/src/schemas/index.ts`));
    console.log(pc.cyan(`  Service: lambdas/${lambdaName}/src/services/index.ts`));
    console.log(pc.cyan(`  Route:   [${method.toUpperCase()}] /${version}${route}`));
    if (i18nConfig) {
        console.log(
            pc.cyan(
                `  i18n:    lambdas/${lambdaName}/src/i18n/index.ts (${i18nConfig.locales.join(', ')}, default: ${i18nConfig.defaultLocale})`
            )
        );
    }
    if (authorizer) {
        console.log(pc.cyan(`  Auth:    Protected by Authorizer Lambda "${authorizer}"`));
    }
}