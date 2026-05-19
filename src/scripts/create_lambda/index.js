import enquirer from 'enquirer';
import pc from 'picocolors';
import { existLambda } from './services/exist_lambda.js';
import { createLambda } from './services/create_lambda.js';
import { updateFastLbsConfigJson } from './services/update_fastlbs_config_json.js';
import { createBaseDoc } from './services/create_base_doc.js';
import { createFunction } from './services/create_function.js';
import { assertValidLambdaName } from '../../utils/cli_validation.js';

export async function createLambdaFunction(lambdaName) {
    assertValidLambdaName(lambdaName);
   const { fileNotFound, exists } = existLambda(lambdaName);
   if (fileNotFound) {
        console.error(pc.red('fastlbs.config.json not found. Please make sure you are in the root directory of a FastLBS project.'));
        return;
   }
   if (exists) {
    console.error(pc.red(`Lambda with name ${lambdaName} already exists. Please choose a different name.`));
    return;
   }
    const response = await enquirer.prompt([
        {
            type: 'select',
            name: 'methods',
            message: 'Select the HTTP methods to be supported by the Lambda function: ',
            choices: [
                { name: 'GET', value: 'get' },
                { name: 'POST', value: 'post' },
                { name: 'PUT', value: 'put' },
                { name: 'DELETE', value: 'delete' },
                { name: 'PATCH', value: 'patch' },
                { name: 'HEAD', value: 'head' },
                { name: 'OPTIONS', value: 'options' },
            ],
            initial: [0]
        },
        {
            type: 'input',
            name: "version",
            message: 'Enter the version for your lambda',
            default: 'v1'
        },
        {
            type: 'input',
            name: "route",
            message: 'Enter the route for your lambda (without version prefix)',
            default: `/${lambdaName}`
        }
    ]);
    const { methods, version } = response;
    let { route } = response;
    const method = Array.isArray(methods) ? methods[0] : methods;
    createLambda(lambdaName);
    updateFastLbsConfigJson(lambdaName);
    if (!route.startsWith('/')) {
        route = '/' + route;
    }
    createBaseDoc(lambdaName, `/${version}${route}`, method);
    createFunction(lambdaName, `${version}${route}`, method);
}