import path from 'path';
import { FastlbsError } from './cli_error.js';

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_-]+$/;

export function assertValidProjectName(projectName) {
    if (typeof projectName !== 'string' || !projectName.trim()) {
        throw new FastlbsError('Project name is required.', {
            code: 'INVALID_PROJECT_NAME',
            hint: 'Use: fastlbs new <project-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(projectName)) {
        throw new FastlbsError(
            `Invalid project name "${projectName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_PROJECT_NAME',
                hint: 'Avoid spaces, slashes and special characters in project names.',
            }
        );
    }
}

export function assertValidLambdaName(lambdaName) {
    if (typeof lambdaName !== 'string' || !lambdaName.trim()) {
        throw new FastlbsError('Lambda name is required.', {
            code: 'INVALID_LAMBDA_NAME',
            hint: 'Use: fastlbs <command> <lambda-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(lambdaName)) {
        throw new FastlbsError(
            `Invalid lambda name "${lambdaName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_LAMBDA_NAME',
                hint: 'Avoid spaces, slashes and dots in lambda names.',
            }
        );
    }
}

export function assertValidMiddlewareName(middlewareName) {
    if (typeof middlewareName !== 'string' || !middlewareName.trim()) {
        throw new FastlbsError('Middleware name is required.', {
            code: 'INVALID_MIDDLEWARE_NAME',
            hint: 'Use: fastlbs create-middleware <middleware-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(middlewareName)) {
        throw new FastlbsError(
            `Invalid middleware name "${middlewareName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_MIDDLEWARE_NAME',
                hint: 'Avoid spaces, slashes and special characters in middleware names.',
            }
        );
    }
}

export function assertPathInsideProject(projectRoot, targetPath, label = 'path') {
    const normalizedRoot = path.resolve(projectRoot);
    const normalizedTarget = path.resolve(targetPath);
    const rootPrefix = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : `${normalizedRoot}${path.sep}`;

    if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(rootPrefix)) {
        throw new FastlbsError(`Unsafe ${label} outside project root: ${normalizedTarget}`, {
            code: 'UNSAFE_PATH',
            hint: 'Check command arguments and project structure.',
        });
    }
}

const BCP47_LOCALE_REGEX = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * Validates and canonicalizes a locale code according to official IETF BCP 47 / ISO standards
 * (e.g. "en", "es", "en-US", "es-419", "pt-BR").
 */
export function normalizeLocaleTag(rawLocale) {
    if (typeof rawLocale !== 'string' || !rawLocale.trim()) {
        throw new FastlbsError('Locale code is required.', {
            code: 'INVALID_LOCALE',
            hint: 'Use official IETF BCP 47 locale tags such as "en", "es", "en-US", or "pt-BR".',
        });
    }

    const normalizedInput = rawLocale.trim().replace(/_/g, '-');
    if (!BCP47_LOCALE_REGEX.test(normalizedInput)) {
        throw new FastlbsError(
            `Invalid locale code "${rawLocale}". Must follow official IETF BCP 47 / ISO nomenclature.`,
            {
                code: 'INVALID_LOCALE',
                hint: 'Examples of valid locales: "en", "es", "fr", "pt-BR", "en-US", "es-MX".',
            }
        );
    }

    try {
        const canonical = Intl.getCanonicalLocales(normalizedInput);
        if (!canonical || canonical.length === 0) {
            throw new Error('Empty canonical locale');
        }
        return canonical[0];
    } catch {
        throw new FastlbsError(
            `Invalid locale code "${rawLocale}". Not recognized as a canonical BCP 47 locale tag.`,
            {
                code: 'INVALID_LOCALE',
                hint: 'Examples of valid locales: "en", "es", "fr", "pt-BR", "en-US", "es-MX".',
            }
        );
    }
}

export function assertValidLocale(rawLocale) {
    return normalizeLocaleTag(rawLocale);
}

/**
 * Parses a comma-separated string or array of locale codes into a deduplicated array
 * of canonical BCP 47 locale tags.
 */
export function parseLocalesList(rawLocales, fallback = ['en', 'es']) {
    if (rawLocales === undefined || rawLocales === null || rawLocales === '') {
        return [...fallback];
    }

    const items = Array.isArray(rawLocales)
        ? rawLocales.flatMap((item) => String(item).split(','))
        : String(rawLocales).split(',');

    const cleaned = items.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
        throw new FastlbsError('At least one locale must be provided.', {
            code: 'INVALID_LOCALE',
            hint: 'Provide a comma-separated list of locales, e.g. --locales en,es',
        });
    }

    const seen = new Set();
    const result = [];
    for (const item of cleaned) {
        const canonical = normalizeLocaleTag(item);
        if (!seen.has(canonical)) {
            seen.add(canonical);
            result.push(canonical);
        }
    }
    return result;
}

/**
 * Converts a BCP 47 locale tag into a valid camelCase JavaScript identifier
 * (e.g. "en" -> "en", "pt-BR" -> "ptBR", "es-419" -> "es419").
 */
export function localeToIdentifier(locale) {
    const canonical = normalizeLocaleTag(locale);
    return canonical.replace(/-([A-Za-z0-9])/g, (_, ch) => ch.toUpperCase());
}

