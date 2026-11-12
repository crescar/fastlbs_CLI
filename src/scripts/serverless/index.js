import fs from 'fs';
import path from 'path';
import { dump, load } from 'js-yaml';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastlbsError } from '../../utils/cli_error.js';
import { syncAllLambdasConfig } from '../../services/serverless/lambda_config_sync.js';

function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Deep merges `base` (defaults from basicServerlessConfig.json) with `userOverride` (existing serverless.yml),
 * preserving user-added keys, CloudFormation resources, IAM statements, VPCs, layers, and environment variables.
 */
export function smartMergeServerlessObjects(base, userOverride) {
    if (!isPlainObject(userOverride)) {
        return structuredClone(base);
    }
    if (!isPlainObject(base)) {
        return structuredClone(userOverride);
    }

    const result = { ...base };

    for (const [key, userVal] of Object.entries(userOverride)) {
        if (key === 'functions') {
            // Handled explicitly below so managed function routes stay synced while custom properties are preserved
            continue;
        }
        const baseVal = base[key];
        if (Array.isArray(baseVal) && Array.isArray(userVal)) {
            // Merge arrays (e.g. plugins) without duplicates, preserving user order/additions
            result[key] = Array.from(new Set([...baseVal, ...userVal]));
        } else if (isPlainObject(baseVal) && isPlainObject(userVal)) {
            result[key] = smartMergeServerlessObjects(baseVal, userVal);
        } else if (userVal !== undefined) {
            result[key] = userVal;
        }
    }

    return result;
}

export function autoGenerateServerless(options = {}) {
    const projectRoot = options.projectRoot || getProjectRootOrThrow();
    const removeFunctions = new Set(Array.isArray(options.removeFunctions) ? options.removeFunctions : []);
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

    const serverlessPath = path.join(projectRoot, 'serverless.yml');
    const existingYaml = fs.existsSync(serverlessPath)
        ? fs.readFileSync(serverlessPath, 'utf-8')
        : '';

    let existingParsed = {};
    if (existingYaml.trim()) {
        try {
            const loaded = load(existingYaml);
            if (isPlainObject(loaded)) {
                existingParsed = loaded;
            }
        } catch {
            existingParsed = {};
        }
    }

    // 1. Non-destructively merge top-level sections (resources, provider.iam, provider.vpc,provider.environment, layers, custom, plugins, etc.)
    const mergedServerless = smartMergeServerlessObjects(baseServerlessConfig, existingParsed);

    // Ensure package.individually is enabled if not explicitly disabled by user
    if (isPlainObject(mergedServerless.package) && mergedServerless.package.individually === undefined) {
        mergedServerless.package.individually = true;
    }

    // 2. Merge functions: preserve custom function properties from serverless.yml (memorySize, timeout, layers, environment, vpc, etc.)
    // while updating handler, events, and package from serverlessConfig/functions/*.json
    const existingFunctions = isPlainObject(existingParsed.functions) ? existingParsed.functions : {};
    const mergedFunctions = {};

    // Keep base functions (__doc__, etc.) merged with any user customizations in serverless.yml
    for (const [fnName, baseFnDef] of Object.entries(baseServerlessConfig.functions || {})) {
        if (removeFunctions.has(fnName)) continue;
        const userFnDef = isPlainObject(existingFunctions[fnName]) ? existingFunctions[fnName] : {};
        mergedFunctions[fnName] = {
            ...userFnDef,
            ...baseFnDef,
        };
    }

    // Keep any external user-defined functions in serverless.yml that were not removed
    for (const [fnName, userFnDef] of Object.entries(existingFunctions)) {
        if (removeFunctions.has(fnName)) continue;
        if (!(fnName in mergedFunctions)) {
            mergedFunctions[fnName] = userFnDef;
        }
    }

    // Apply managed FastLBS functions from serverlessConfig/functions/*.json
    const functionFiles = fs.readdirSync(functionsDir).filter((file) => file.endsWith('.json'));
    functionFiles.forEach((file) => {
        const functionConfigPath = path.join(functionsDir, file);
        const functionConfig = JSON.parse(fs.readFileSync(functionConfigPath, 'utf-8'));
        const functionName = path.basename(file, '.json');
        if (removeFunctions.has(functionName)) return;

        const rawBlock = functionConfig[functionName] || functionConfig;
        const { _docMeta, _lambdaKind, ...cleanServerlessBlock } = rawBlock || {};
        const userFnDef = isPlainObject(existingFunctions[functionName])
            ? existingFunctions[functionName]
            : {};

        mergedFunctions[functionName] = {
            ...userFnDef,
            ...cleanServerlessBlock,
            package: cleanServerlessBlock.package || userFnDef.package || {
                patterns: [`dist/${functionName}/**`],
            },
        };
    });

    mergedServerless.functions = mergedFunctions;

    const yamlStr = dump(mergedServerless, { noRefs: true });

    if (existingYaml.trim() !== yamlStr.trim()) {
        fs.writeFileSync(serverlessPath, yamlStr, 'utf-8');
    }

    return mergedServerless;
}