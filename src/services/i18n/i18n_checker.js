import fs from 'fs';
import path from 'path';
import { getExistingLambdaLocales, getProjectI18nConfig } from './i18n_scaffolder.js';

function flattenKeys(obj, prefix = '') {
    const result = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return result;
    }

    for (const [key, value] of Object.entries(obj)) {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenKeys(value, nextPath));
        } else {
            result[nextPath] = value;
        }
    }
    return result;
}

function extractPlaceholders(str) {
    if (typeof str !== 'string') return [];
    const matches = [...str.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)];
    return [...new Set(matches.map((m) => m[1]))].sort();
}

/**
 * Checks a single lambda's `src/i18n/locales/*.json` files against its default locale.
 */
export function checkSingleLambdaI18n(projectRoot, lambdaName, defaultLocaleOverride = null) {
    const localesDir = path.join(projectRoot, 'lambdas', lambdaName, 'src', 'i18n', 'locales');
    if (!fs.existsSync(localesDir)) {
        return {
            lambdaName,
            hasI18n: false,
            valid: true,
            defaultLocale: null,
            locales: [],
            issues: [],
        };
    }

    const projectI18n = getProjectI18nConfig(projectRoot);
    let lambdaDefaultLocale = defaultLocaleOverride || projectI18n.defaultLocale;

    // Also inspect fastlbs.config.json lambda entry if present
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (!defaultLocaleOverride && fs.existsSync(configPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const lambdaMeta = cfg?.lambdas?.[lambdaName];
            if (lambdaMeta?.i18n?.defaultLocale) {
                lambdaDefaultLocale = lambdaMeta.i18n.defaultLocale;
            }
        } catch {
            // Ignore
        }
    }

    const locales = getExistingLambdaLocales(localesDir);
    if (locales.length === 0) {
        return {
            lambdaName,
            hasI18n: true,
            valid: false,
            defaultLocale: lambdaDefaultLocale,
            locales: [],
            issues: [
                {
                    locale: lambdaDefaultLocale,
                    type: 'NO_LOCALE_FILES',
                    message: `No locale JSON files found in lambdas/${lambdaName}/src/i18n/locales`,
                },
            ],
        };
    }

    const effectiveDefault = locales.includes(lambdaDefaultLocale)
        ? lambdaDefaultLocale
        : locales[0];

    const parsedBundles = {};
    const issues = [];

    for (const locale of locales) {
        const filePath = path.join(localesDir, `${locale}.json`);
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            parsedBundles[locale] = flattenKeys(JSON.parse(raw));
        } catch (err) {
            issues.push({
                locale,
                type: 'INVALID_JSON',
                message: `Invalid JSON in ${locale}.json: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }

    const baseBundle = parsedBundles[effectiveDefault];
    if (!baseBundle) {
        return {
            lambdaName,
            hasI18n: true,
            valid: false,
            defaultLocale: effectiveDefault,
            locales,
            issues,
        };
    }

    const baseKeys = Object.keys(baseBundle);

    for (const locale of locales) {
        if (locale === effectiveDefault) continue;
        const targetBundle = parsedBundles[locale];
        if (!targetBundle) continue;

        const targetKeys = Object.keys(targetBundle);

        for (const key of baseKeys) {
            if (!(key in targetBundle)) {
                issues.push({
                    locale,
                    key,
                    type: 'MISSING_KEY',
                    message: `[${locale}] Missing translation key "${key}" (present in "${effectiveDefault}")`,
                });
                continue;
            }

            const baseVars = extractPlaceholders(baseBundle[key]);
            const targetVars = extractPlaceholders(targetBundle[key]);
            if (baseVars.join(',') !== targetVars.join(',')) {
                issues.push({
                    locale,
                    key,
                    type: 'MISMATCHED_PLACEHOLDERS',
                    expected: baseVars,
                    actual: targetVars,
                    message: `[${locale}] Mismatched placeholders in "${key}": expected {${baseVars.join(', ')}} but found {${targetVars.join(', ')}}`,
                });
            }
        }

        for (const key of targetKeys) {
            if (!(key in baseBundle)) {
                issues.push({
                    locale,
                    key,
                    type: 'EXTRA_KEY',
                    message: `[${locale}] Extra key "${key}" not present in default locale "${effectiveDefault}"`,
                });
            }
        }
    }

    return {
        lambdaName,
        hasI18n: true,
        valid: issues.length === 0,
        ok: issues.length === 0,
        defaultLocale: effectiveDefault,
        locales,
        totalKeys: baseKeys.length,
        issues,
    };
}

/**
 * Checks i18n locale files for a specific lambda or all lambdas in the project.
 */
export function checkProjectI18n(projectRoot, targetLambdaName = null) {
    const lambdasDir = path.join(projectRoot, 'lambdas');
    const lambdaNames = [];

    if (targetLambdaName) {
        lambdaNames.push(targetLambdaName);
    } else if (fs.existsSync(lambdasDir)) {
        for (const entry of fs.readdirSync(lambdasDir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== '__doc__' && !entry.name.startsWith('@')) {
                lambdaNames.push(entry.name);
            }
        }
    }

    const reports = [];
    for (const name of lambdaNames) {
        const report = checkSingleLambdaI18n(projectRoot, name);
        if (targetLambdaName || report.hasI18n) {
            reports.push(report);
        }
    }

    const allValid = reports.every((r) => r.valid);
    const totalIssues = reports.reduce((acc, r) => acc + (r.issues?.length || 0), 0);
    return {
        valid: allValid,
        ok: allValid,
        checked: reports.length,
        totalIssues,
        reports,
        results: reports,
    };
}
