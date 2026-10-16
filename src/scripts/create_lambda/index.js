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

export async function createLambdaFunction(lambdaName) {
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

    const kind = Array.isArray(lambdaKind) ? lambdaKind[0] : lambdaKind;

    if (kind === 'authorizer' || kind === 'auxiliary') {
        createLambda(lambdaName, null, null, { kind });
        updateFastLbsConfigJson(lambdaName, kind);
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

    const httpQuestions = [
        {
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
        },
        {
            type: 'input',
            name: 'version',
            message: 'Enter the version for your lambda:',
            default: 'v1',
        },
        {
            type: 'input',
            name: 'route',
            message: 'Enter the route for your lambda (without version prefix):',
            default: `/${lambdaName}`,
        },
    ];

    if (authorizers.length > 0) {
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

    if (auxiliaries.length > 0) {
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

    const response = await enquirer.prompt(httpQuestions);

    const { methods, version, selectedAuthorizer, selectedAuxiliary } = response;
    let { route } = response;
    const method = Array.isArray(methods) ? methods[0] : methods;
    const authorizer =
        selectedAuthorizer && selectedAuthorizer !== 'none' ? selectedAuthorizer : null;
    const beforeAux =
        selectedAuxiliary && selectedAuxiliary !== 'none' ? selectedAuxiliary : null;

    if (!route.startsWith('/')) {
        route = '/' + route;
    }

    const fullPath = `${version}${route}`;
    createLambda(lambdaName, fullPath, method, {
        kind: 'http',
        authorizer,
        beforeAux,
    });
    updateFastLbsConfigJson(lambdaName, 'http');

    createFunction(lambdaName, fullPath, method, {
        kind: 'http',
        authorizer,
    });
    createBaseDoc(lambdaName, `/${fullPath}`, method);
    autoGenerateServerless();

    console.log(pc.green(`✔ Lambda "${lambdaName}" created successfully!`));
    console.log(pc.cyan(`  Handler: lambdas/${lambdaName}/src/index.ts`));
    console.log(pc.cyan(`  Schemas: lambdas/${lambdaName}/src/schemas/index.ts`));
    console.log(pc.cyan(`  Service: lambdas/${lambdaName}/src/services/index.ts`));
    console.log(pc.cyan(`  Route:   [${method.toUpperCase()}] /${version}${route}`));
    if (authorizer) {
        console.log(pc.cyan(`  Auth:    Protected by Authorizer Lambda "${authorizer}"`));
    }
}