import fs from 'fs';
import path from 'path';
import { dump } from 'js-yaml';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastlbsError } from '../../utils/cli_error.js';
import { syncAllLambdasConfig } from '../../services/serverless/lambda_config_sync.js';

export function autoGenerateServerless() {
    const projectRoot = getProjectRootOrThrow();
    const baseServerlessPath = path.join(projectRoot, 'serverlessConfig/basicServerlessConfig.json');

    if (!fs.existsSync(baseServerlessPath)) {
        throw new FastlbsError('Base serverless configuration not found at serverlessConfig/basicServerlessConfig.json.', {
            code: 'SERVERLESS_CONFIG_NOT_FOUND',
            hint: 'Ensure this is a valid FastLBS project generated with "fastlbs new <project-name>".',
        });
    }

    // Automatically synchronize all lambda event definitions from source files first
    syncAllLambdasConfig(projectRoot);

    const baseServerlessConfig = JSON.parse(fs.readFileSync(baseServerlessPath, 'utf-8'));
    baseServerlessConfig.functions = baseServerlessConfig.functions || {};

    const functionsDir = path.join(projectRoot, 'serverlessConfig/functions');
    if (!fs.existsSync(functionsDir)) {
        throw new FastlbsError('Functions directory not found at serverlessConfig/functions.', {
            code: 'FUNCTIONS_DIR_NOT_FOUND',
            hint: 'Ensure serverlessConfig/functions exists in the project root.',
        });
    }

    const functionFiles = fs.readdirSync(functionsDir).filter((file) => file.endsWith('.json'));

    functionFiles.forEach((file) => {
        const functionConfigPath = path.join(functionsDir, file);
        const functionConfig = JSON.parse(fs.readFileSync(functionConfigPath, 'utf-8'));
        const functionName = path.basename(file, '.json');
        const rawBlock = functionConfig[functionName] || functionConfig;
        const { _docMeta, ...cleanServerlessBlock } = rawBlock || {};
        baseServerlessConfig.functions[functionName] = cleanServerlessBlock;
    });

    const yamlStr = dump(baseServerlessConfig);
    const serverlessPath = path.join(projectRoot, 'serverless.yml');

    const existingYaml = fs.existsSync(serverlessPath)
        ? fs.readFileSync(serverlessPath, 'utf-8')
        : '';

    if (existingYaml.trim() !== yamlStr.trim()) {
        fs.writeFileSync(serverlessPath, yamlStr, 'utf-8');
    }
}