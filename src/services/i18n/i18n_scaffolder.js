import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import {
    assertPathInsideProject,
    assertValidLambdaName,
    localeToIdentifier,
    normalizeLocaleTag,
    parseLocalesList,
} from '../../utils/cli_validation.js';
import { ensureCommonI18n } from '../../scripts/new_project/services/create_base_i18n.js';
import { createBaseContext } from '../../scripts/new_project/services/create_base_context.js';
import { createBaseWrapper } from '../../scripts/new_project/services/create_base_wrapper.js';
import { createHandlerResponses } from '../../scripts/new_project/services/create_handler_responses.js';
import { createValidatorBaseMiddleware } from '../../scripts/new_project/services/validator_base_middleware.js';
import { createZodOpenApiUtil } from '../../scripts/new_project/services/create_zod_openapi_util.js';

export const I18N_MARKER = '@fastlbs-i18n';

/**
 * Reads project-level i18n settings from `fastlbs.config.json`.
 */
export function getProjectI18nConfig(projectRoot) {
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    let rawConfig = {};
    if (fs.existsSync(configPath)) {
        try {
            rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            rawConfig = {};
        }
    }

    const i18nBlock = rawConfig.i18n && typeof rawConfig.i18n === 'object' ? rawConfig.i18n : {};
    const rawDefault = i18nBlock.defaultLocale || rawConfig.defaultLocale || 'en';
    const defaultLocale = normalizeLocaleTag(rawDefault);
    const locales = parseLocalesList(i18nBlock.locales, [defaultLocale, 'es']);
    if (!locales.includes(defaultLocale)) {
        locales.unshift(defaultLocale);
    }

    return {
        serviceName: rawConfig.service || 'my-fastlbs-project',
        defaultLocale,
        locales,
        enabledByDefault: Boolean(i18nBlock.enabledByDefault),
    };
}

/**
 * Resolves effective i18n settings by combining CLI overrides with `fastlbs.config.json`.
 */
export function resolveI18nSettings(projectRoot, overrides = {}) {
    const projectCfg = getProjectI18nConfig(projectRoot);
    const defaultLocale = overrides.defaultLocale
        ? normalizeLocaleTag(overrides.defaultLocale)
        : projectCfg.defaultLocale;

    const locales = overrides.locales
        ? parseLocalesList(overrides.locales, projectCfg.locales)
        : [...projectCfg.locales];

    if (!locales.includes(defaultLocale)) {
        locales.unshift(defaultLocale);
    }

    return {
        serviceName: projectCfg.serviceName,
        defaultLocale,
        locales,
        enabledByDefault:
            overrides.enabledByDefault !== undefined
                ? Boolean(overrides.enabledByDefault)
                : projectCfg.enabledByDefault,
    };
}

/**
 * Updates the application's default locale and supported locales in `fastlbs.config.json`
 * and synchronizes `APP_DEFAULT_LOCALE` in `libs/common/i18n/index.ts`.
 */
export function updateProjectDefaultLocale(projectRoot, newDefaultLocale, extraLocales = []) {
    const canonicalDefault = normalizeLocaleTag(newDefaultLocale);
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    let config = { service: 'my-fastlbs-project', frameworkVersion: '1', lambdas: {} };

    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            // Keep default fallback object
        }
    }

    const existingLocales = config.i18n?.locales || [canonicalDefault, 'es'];
    const mergedLocales = parseLocalesList(
        [canonicalDefault, ...extraLocales, ...existingLocales],
        [canonicalDefault, 'es']
    );

    config.defaultLocale = canonicalDefault;
    config.i18n = {
        ...(config.i18n && typeof config.i18n === 'object' ? config.i18n : {}),
        defaultLocale: canonicalDefault,
        locales: mergedLocales,
        enabledByDefault: Boolean(config.i18n?.enabledByDefault),
    };

    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    ensureCommonI18n(projectRoot, {
        defaultLocale: canonicalDefault,
        locales: mergedLocales,
    });

    return {
        defaultLocale: canonicalDefault,
        locales: mergedLocales,
    };
}

/**
 * Builds the seed translation dictionary for a lambda based on its kind and target locale.
 */
export function buildLambdaLocaleSeed(lambdaName, locale, defaultLocale = 'en', kind = 'http') {
    const canonical = normalizeLocaleTag(locale);
    const baseLang = canonical.split('-')[0].toLowerCase();

    const seedsByKind = {
        http: {
            en: {
                greeting: `Hello, {{name}}! from Lambda ${lambdaName}`,
                items_one: 'You have {{count}} item',
                items_other: 'You have {{count}} items',
                errors: {
                    invalidName: "Name cannot be '{{name}}'",
                },
            },
            es: {
                greeting: `¡Hola, {{name}}! desde la Lambda ${lambdaName}`,
                items_one: 'Tienes {{count}} elemento',
                items_other: 'Tienes {{count}} elementos',
                errors: {
                    invalidName: "El nombre no puede ser '{{name}}'",
                },
            },
        },
        authorizer: {
            en: {
                auth: {
                    authorized: 'Authorized',
                    unauthorized: 'Unauthorized',
                    forbidden: "Access denied for user '{{user}}'",
                },
            },
            es: {
                auth: {
                    authorized: 'Autorizado',
                    unauthorized: 'No autorizado',
                    forbidden: "Acceso denegado para el usuario '{{user}}'",
                },
            },
        },
        auxiliary: {
            en: {
                auxiliary: {
                    processed: `Action '{{action}}' processed by ${lambdaName}`,
                },
            },
            es: {
                auxiliary: {
                    processed: `Acción '{{action}}' procesada por ${lambdaName}`,
                },
            },
        },
    };

    const kindMap = seedsByKind[kind] || seedsByKind.http;
    if (kindMap[canonical]) {
        return kindMap[canonical];
    }
    if (kindMap[baseLang]) {
        return kindMap[baseLang];
    }

    const defaultBase = String(defaultLocale).split('-')[0].toLowerCase();
    return kindMap[defaultBase] || kindMap.en;
}

/**
 * Generates the TypeScript source for `lambdas/<lambdaName>/src/i18n/index.ts`.
 */
export function buildLambdaI18nIndexContent(projectName, locales, defaultLocale = 'en') {
    const canonicalDefault = normalizeLocaleTag(defaultLocale);
    const normalizedLocales = parseLocalesList(locales, [canonicalDefault, 'es']);
    if (!normalizedLocales.includes(canonicalDefault)) {
        normalizedLocales.unshift(canonicalDefault);
    }

    const commonImports = normalizedLocales
        .map((loc) => {
            const id = `common_${localeToIdentifier(loc)}`;
            return `import ${id} from "@${projectName}/common/i18n/locales/${loc}.json";`;
        })
        .join('\n');

    const localImports = normalizedLocales
        .map((loc) => {
            const id = localeToIdentifier(loc);
            return `import ${id} from "./locales/${loc}.json";`;
        })
        .join('\n');

    const resourcesEntries = normalizedLocales
        .map((loc) => {
            const localId = localeToIdentifier(loc);
            const commonId = `common_${localId}`;
            const propKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(loc) ? loc : JSON.stringify(loc);
            return `        ${propKey}: { ...${commonId}, ...${localId} },`;
        })
        .join('\n');

    const defaultLocalId = localeToIdentifier(canonicalDefault);
    const defaultCommonId = `common_${defaultLocalId}`;

    return `import { defineI18n, type Paths } from "@${projectName}/common/i18n";
${commonImports}
${localImports}

export const i18n = defineI18n({
    defaultLocale: "${canonicalDefault}",
    resources: {
${resourcesEntries}
    },
});

export type I18nKey = Paths<typeof ${defaultLocalId} & typeof ${defaultCommonId}>;
`;
}

/**
 * Discovers any existing locale JSON files inside `lambdas/<lambdaName>/src/i18n/locales`.
 */
export function getExistingLambdaLocales(localesDirOrProjectRoot, lambdaName = null) {
    const localesDir = lambdaName
        ? path.join(localesDirOrProjectRoot, 'lambdas', lambdaName, 'src', 'i18n', 'locales')
        : localesDirOrProjectRoot;
    if (!fs.existsSync(localesDir)) {
        return [];
    }
    const entries = fs.readdirSync(localesDir, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
            const rawTag = entry.name.slice(0, -5);
            try {
                found.push(normalizeLocaleTag(rawTag));
            } catch {
                // Ignore non-BCP47 json files
            }
        }
    }
    return found;
}

/**
 * Scaffolds `lambdas/<lambdaName>/src/i18n/index.ts` and `locales/<locale>.json` files.
 * Idempotent: preserves existing locale JSON files and adds only missing locales.
 */
export function scaffoldLambdaI18n(projectRoot, lambdaName, options = {}) {
    assertValidLambdaName(lambdaName);
    const lambdaDir = path.join(projectRoot, 'lambdas', lambdaName);
    assertPathInsideProject(projectRoot, lambdaDir, 'lambda directory');

    const settings = resolveI18nSettings(projectRoot, options);
    const kind = options.kind || 'http';

    const i18nDir = path.join(lambdaDir, 'src', 'i18n');
    const localesDir = path.join(i18nDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const existingLocales = getExistingLambdaLocales(localesDir);
    const allLocales = parseLocalesList(
        [settings.defaultLocale, ...existingLocales, ...settings.locales],
        [settings.defaultLocale, 'es']
    );

    // Ensure shared common i18n runtime and common locale JSON files exist for all locales
    ensureCommonI18n(projectRoot, {
        defaultLocale: settings.defaultLocale,
        locales: allLocales,
    });

    const createdLocales = [];
    for (const locale of allLocales) {
        const localeFilePath = path.join(localesDir, `${locale}.json`);
        if (!fs.existsSync(localeFilePath)) {
            const seed = buildLambdaLocaleSeed(lambdaName, locale, settings.defaultLocale, kind);
            fs.writeFileSync(localeFilePath, `${JSON.stringify(seed, null, 4)}\n`, 'utf-8');
            createdLocales.push(locale);
        }
    }

    const indexPath = path.join(i18nDir, 'index.ts');
    const indexContent = buildLambdaI18nIndexContent(
        settings.serviceName,
        allLocales,
        settings.defaultLocale
    );
    fs.writeFileSync(indexPath, indexContent, 'utf-8');

    return {
        i18nDir,
        localesDir,
        indexPath,
        defaultLocale: settings.defaultLocale,
        locales: allLocales,
        createdLocales,
        existingLocales,
        createdFiles: createdLocales,
        preservedFiles: existingLocales,
    };
}

/**
 * Patches an existing `lambdas/<lambdaName>/src/index.ts` to import `./i18n`
 * and pass `i18n` into `handlerResponse`, `handlerAuthorizer`, or `handlerAuxiliary`.
 * Idempotent: returns `{ patched: false, alreadyConfigured: true, reason: 'already_configured' }` if already wired.
 */
export function patchHandlerWithI18n(indexPath) {
    if (!fs.existsSync(indexPath)) {
        return {
            patched: false,
            alreadyConfigured: false,
            reason: 'file_not_found',
            manualSnippet: `import { i18n } from "./i18n";\n// Pass { i18n } in handlerResponse({ i18n, ... }, service)`,
        };
    }

    const original = fs.readFileSync(indexPath, 'utf-8');
    const hasI18nImport = /import\s+\{[^}]*\bi18n\b[^}]*\}\s+from\s+["']\.\/i18n["']/.test(original);
    const hasI18nOption = /\bi18n\s*(?:,|:|\})/.test(original);

    if (hasI18nImport && hasI18nOption) {
        return {
            patched: false,
            alreadyConfigured: true,
            reason: 'already_configured',
        };
    }

    let updated = original;

    // 1. Insert `import { i18n } from "./i18n";` after last import statement if not present
    if (!hasI18nImport) {
        const importMatches = [...updated.matchAll(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?/gm)];
        if (importMatches.length > 0) {
            const lastImport = importMatches[importMatches.length - 1];
            const insertPos = lastImport.index + lastImport[0].length;
            updated =
                updated.slice(0, insertPos) +
                `\nimport { i18n } from "./i18n";` +
                updated.slice(insertPos);
        } else {
            updated = `import { i18n } from "./i18n";\n${updated}`;
        }
    }

    // 2. Wire `i18n` into handlerResponse / handlerAuthorizer / handlerAuxiliary
    if (!hasI18nOption) {
        const handlerOptionsPattern =
            /(\b(?:handlerResponse|handlerAuthorizer|handlerAuxiliary)\s*(?:<[\s\S]*?>)?\s*\(\s*\{)/m;
        const handlerDirectPattern =
            /(\b(?:handlerResponse|handlerAuthorizer|handlerAuxiliary)\s*(?:<[\s\S]*?>)?\s*\()(\s*(?!\{))/m;

        if (handlerOptionsPattern.test(updated)) {
            updated = updated.replace(handlerOptionsPattern, `$1\n        i18n,`);
        } else if (handlerDirectPattern.test(updated)) {
            updated = updated.replace(handlerDirectPattern, `$1{ i18n }, $2`);
        } else {
            return {
                patched: false,
                alreadyConfigured: false,
                manualSnippet: `import { i18n } from "./i18n";\n\nexport const handler = handlerResponse(\n  {\n    i18n,\n    // ...existing options\n  },\n  service\n);`,
            };
        }
    }

    fs.writeFileSync(indexPath, updated, 'utf-8');
    return {
        patched: true,
        alreadyConfigured: false,
    };
}

/**
 * Registers i18n metadata for a lambda inside `fastlbs.config.json`.
 */
export function registerLambdaI18n(projectRoot, lambdaName, { defaultLocale, locales }) {
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.lambdas = config?.lambdas && typeof config.lambdas === 'object' ? config.lambdas : {};
        const existingLambda = config.lambdas[lambdaName] || {
            directory: `lambdas/${lambdaName}`,
            kind: 'http',
        };
        config.lambdas[lambdaName] = {
            ...existingLambda,
            i18n: {
                defaultLocale,
                locales,
            },
        };
        if (!config.defaultLocale) {
            config.defaultLocale = defaultLocale;
        }
        if (!config.i18n) {
            config.i18n = {
                defaultLocale,
                locales,
                enabledByDefault: false,
            };
        }
        fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    } catch {
        // Ignore malformed config file
    }
}

/**
 * Checks whether the project's shared `libs/common` files have i18n support (`@fastlbs-i18n`).
 * For projects created with older FastLBS versions, offers to upgrade them with `.bak` backups.
 */
export async function ensureProjectI18nSupport(projectRoot, options = {}) {
    const settings = resolveI18nSettings(projectRoot, options);
    ensureCommonI18n(projectRoot, settings);

    const requiredFiles = [
        {
            relPath: 'libs/common/context/fastlbsContext.ts',
            anchor: 'export class FastlbsEvent',
        },
        {
            relPath: 'libs/common/wrappers/handlerResponse.wrapper.ts',
            anchor: 'export function handlerResponse',
        },
        {
            relPath: 'libs/common/utils/handlerErrorResponse.util.ts',
            anchor: 'export class HandlerErrorResponse',
        },
        {
            relPath: 'libs/common/utils/handlerStandardResponse.util.ts',
            anchor: 'export class HandlerStandardResponse',
        },
        {
            relPath: 'libs/common/middlewares/validator.middleware.ts',
            anchor: 'export function validatorMiddleware',
        },
    ];

    const outdatedFiles = [];
    const unrecognizedFiles = [];

    for (const item of requiredFiles) {
        const fullPath = path.join(projectRoot, item.relPath);
        if (!fs.existsSync(fullPath)) {
            outdatedFiles.push({ ...item, fullPath, exists: false });
            continue;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(I18N_MARKER)) {
            if (content.includes(item.anchor)) {
                outdatedFiles.push({ ...item, fullPath, exists: true });
            } else {
                unrecognizedFiles.push(item.relPath);
            }
        }
    }

    if (outdatedFiles.length === 0 && unrecognizedFiles.length === 0) {
        return { upgraded: false, alreadySupported: true, backups: [] };
    }

    if (unrecognizedFiles.length > 0) {
        return {
            upgraded: false,
            alreadySupported: false,
            unrecognizedFiles,
            manualInstructions:
                `Custom modifications detected in: ${unrecognizedFiles.join(', ')}.\n` +
                `Add bindI18n/t(key, params) to FastlbsEvent and pass options.i18n in handlerResponse.wrapper.ts.`,
        };
    }

    let shouldUpgrade = options.autoUpgrade !== false;
    if (options.interactive && process.stdout.isTTY) {
        const response = await enquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmUpgrade',
                message:
                    'Shared @common files were generated by an older FastLBS version without i18n. Upgrade them automatically (creates .bak backups)?',
                initial: true,
            },
        ]);
        shouldUpgrade = Boolean(response.confirmUpgrade);
    }

    if (!shouldUpgrade) {
        return {
            upgraded: false,
            alreadySupported: false,
            skippedByUser: true,
        };
    }

    const backups = [];
    for (const fileInfo of outdatedFiles) {
        if (fileInfo.exists) {
            const backupPath = `${fileInfo.fullPath}.bak`;
            fs.copyFileSync(fileInfo.fullPath, backupPath);
            backups.push(path.relative(projectRoot, backupPath));
        }
    }

    const prevCwd = process.cwd();
    const parentDir = path.dirname(projectRoot);
    const dirName = path.basename(projectRoot);
    try {
        process.chdir(parentDir);
        createBaseContext(dirName);
        createHandlerResponses(dirName);
        createValidatorBaseMiddleware(dirName);
        createBaseWrapper(dirName);
        createZodOpenApiUtil(dirName);
    } finally {
        process.chdir(prevCwd);
    }

    return {
        upgraded: true,
        alreadySupported: true,
        backups,
    };
}
