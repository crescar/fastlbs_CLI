import fs from 'fs';
import path from 'path';
import { normalizeLocaleTag, parseLocalesList } from '../../../utils/cli_validation.js';

export const COMMON_I18N_MESSAGES = {
    en: {
        common: {
            success: 'Request successful',
            errors: {
                unexpected: 'An unexpected error occurred',
                unauthorized: 'Unauthorized',
                forbidden: 'Forbidden',
                notFound: 'Resource not found',
                badRequest: 'Invalid request',
            },
            validation: {
                invalidRequest: 'Invalid request',
                invalidJson: 'Invalid JSON in request body',
                zod: {
                    required: "Field '{{field}}' is required",
                    invalidType: 'Expected {{expected}}, received {{received}}',
                    invalidString: 'Invalid {{validation}} format',
                    invalidEmail: 'Invalid email address',
                    invalidUuid: 'Invalid UUID',
                    invalidUrl: 'Invalid URL',
                    tooSmallString: 'Must contain at least {{minimum}} character(s)',
                    tooSmallNumber: 'Must be greater than or equal to {{minimum}}',
                    tooSmallArray: 'Must contain at least {{minimum}} item(s)',
                    tooBigString: 'Must contain at most {{maximum}} character(s)',
                    tooBigNumber: 'Must be less than or equal to {{maximum}}',
                    tooBigArray: 'Must contain at most {{maximum}} item(s)',
                    invalidEnum: 'Invalid value. Expected one of: {{options}}',
                },
            },
        },
    },
    es: {
        common: {
            success: 'Solicitud exitosa',
            errors: {
                unexpected: 'Ocurrió un error inesperado',
                unauthorized: 'No autorizado',
                forbidden: 'Acceso denegado',
                notFound: 'Recurso no encontrado',
                badRequest: 'Solicitud inválida',
            },
            validation: {
                invalidRequest: 'Solicitud inválida',
                invalidJson: 'JSON inválido en el cuerpo de la solicitud',
                zod: {
                    required: "El campo '{{field}}' es obligatorio",
                    invalidType: 'Se esperaba {{expected}}, pero se recibió {{received}}',
                    invalidString: 'Formato de {{validation}} inválido',
                    invalidEmail: 'Correo electrónico inválido',
                    invalidUuid: 'UUID inválido',
                    invalidUrl: 'URL inválida',
                    tooSmallString: 'Debe tener al menos {{minimum}} caracteres',
                    tooSmallNumber: 'Debe ser mayor o igual a {{minimum}}',
                    tooSmallArray: 'Debe contener al menos {{minimum}} elemento(s)',
                    tooBigString: 'Debe tener como máximo {{maximum}} caracteres',
                    tooBigNumber: 'Debe ser menor o igual a {{maximum}}',
                    tooBigArray: 'Debe contener como máximo {{maximum}} elemento(s)',
                    invalidEnum: 'Valor inválido. Se esperaba uno de: {{options}}',
                },
            },
        },
    },
};

export function getCommonLocaleTemplate(locale, defaultLocale = 'en') {
    const canonical = normalizeLocaleTag(locale);
    const baseLang = canonical.split('-')[0].toLowerCase();
    if (COMMON_I18N_MESSAGES[canonical]) {
        return COMMON_I18N_MESSAGES[canonical];
    }
    if (COMMON_I18N_MESSAGES[baseLang]) {
        return COMMON_I18N_MESSAGES[baseLang];
    }
    const defaultBase = String(defaultLocale).split('-')[0].toLowerCase();
    return COMMON_I18N_MESSAGES[defaultBase] || COMMON_I18N_MESSAGES.en;
}

export function buildCommonI18nRuntimeContent(defaultLocale = 'en') {
    const canonicalDefault = normalizeLocaleTag(defaultLocale);
    return `/* @fastlbs-i18n v1 */
export const APP_DEFAULT_LOCALE = "${canonicalDefault}";

const BUILTIN_COMMON_MESSAGES: Record<string, Record<string, any>> = ${JSON.stringify(COMMON_I18N_MESSAGES, null, 2)};

type StripPluralSuffix<K extends string> =
  K extends \`\${infer Base}_\${"zero" | "one" | "two" | "few" | "many" | "other"}\`
    ? Base | K
    : K;

/**
 * Extracts dot-notation translation keys from a locale JSON structure.
 * Plural keys (e.g. "items_one", "items_other") can be referenced by their base key ("items").
 */
export type Paths<T, Prev extends string = ""> = T extends Record<string, any>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, any>
        ? Paths<T[K], \`\${Prev}\${K}.\`>
        : \`\${Prev}\${StripPluralSuffix<K>}\`;
    }[keyof T & string]
  : string;

export type TranslationParams = Record<string, unknown> & {
  count?: number;
};

export type LocaleDetectionSource =
  | "query"
  | "header"
  | "accept-language"
  | "auth"
  | "payload";

export interface I18nConfig<
  TResources extends Record<string, Record<string, any>> = Record<string, Record<string, any>>
> {
  /**
   * Default locale for this lambda. Defaults to APP_DEFAULT_LOCALE from project config.
   */
  defaultLocale?: string;
  /**
   * Secondary fallback locale if a key is missing in the active locale.
   */
  fallbackLocale?: string;
  /**
   * Dictionary of locale tags (BCP 47, e.g. "en", "es", "pt-BR") to translation objects.
   */
  resources?: TResources;
  /**
   * Alias for resources (dictionary of locale tags to translation objects).
   */
  locales?: TResources;
  /**
   * Ordered list of sources inspected to negotiate the request locale.
   * Defaults to: ["query", "header", "accept-language", "auth", "payload"]
   */
  detect?: LocaleDetectionSource[];
  /**
   * Query string parameter name inspected when "query" detection is active (default: "lang").
   */
  queryParam?: string;
  /**
   * Request header name inspected when "header" detection is active (default: "x-lang").
   */
  header?: string;
}

export type TranslateFunction<TKey extends string = string> = (
  key: TKey | (string & {}),
  params?: TranslationParams
) => string;

export interface I18nInstance<TKey extends string = string> {
  readonly __fastlbsI18n: true;
  readonly defaultLocale: string;
  readonly fallbackLocale: string;
  readonly locales: string[];
  readonly resources: Record<string, Record<string, any>>;
  resolveLocale(event: any): string;
  translator(locale?: string): TranslateFunction<TKey>;
  createTranslator(locale?: string): TranslateFunction<TKey>;
  t(key: TKey | (string & {}), params?: TranslationParams, locale?: string): string;
  has(key: string, locale?: string): boolean;
  formatNumber(value: number, locale?: string, options?: Intl.NumberFormatOptions): string;
  formatCurrency(
    value: number,
    currency: string,
    locale?: string,
    options?: Intl.NumberFormatOptions
  ): string;
  formatDate(
    value: Date | number | string,
    locale?: string,
    options?: Intl.DateTimeFormatOptions
  ): string;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules("en");
    }
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

function getCaseInsensitiveHeader(
  headers: Record<string, string | undefined> | undefined,
  targetName: string
): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const lower = targetName.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

/**
 * Parses an HTTP Accept-Language header into locale tags ordered by descending quality weight (q).
 */
export function parseAcceptLanguage(headerValue?: string): string[] {
  if (!headerValue || typeof headerValue !== "string") return [];
  return headerValue
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = rawTag.trim();
      if (!tag || tag === "*") return null;
      let q = 1.0;
      for (const param of params) {
        const [k, v] = param.trim().split("=");
        if (k === "q" && v !== undefined) {
          const parsed = Number.parseFloat(v);
          if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            q = parsed;
          }
        }
      }
      return { tag, q, index };
    })
    .filter((item): item is { tag: string; q: number; index: number } => item !== null && item.q > 0)
    .sort((a, b) => (b.q !== a.q ? b.q - a.q : a.index - b.index))
    .map((item) => item.tag);
}

function matchSupportedLocale(
  candidate: string | undefined,
  supportedLocales: string[]
): string | undefined {
  if (!candidate || typeof candidate !== "string") return undefined;
  const normalized = candidate.trim().replace(/_/g, "-");
  if (!normalized) return undefined;
  const lowerCandidate = normalized.toLowerCase();

  // 1. Exact case-insensitive match (e.g. "es-MX" -> "es-MX")
  for (const loc of supportedLocales) {
    if (loc.toLowerCase() === lowerCandidate) {
      return loc;
    }
  }

  // 2. Candidate is regional ("es-MX"), match base language ("es")
  const baseLang = lowerCandidate.split("-")[0];
  for (const loc of supportedLocales) {
    if (loc.toLowerCase() === baseLang) {
      return loc;
    }
  }

  // 3. Candidate is base ("es"), match first regional variant ("es-ES", "es-MX")
  for (const loc of supportedLocales) {
    if (loc.toLowerCase().startsWith(\`\${baseLang}-\`)) {
      return loc;
    }
  }

  return undefined;
}

function lookupNestedValue(obj: Record<string, any> | undefined, keyPath: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  if (keyPath in obj && typeof obj[keyPath] !== "object") {
    return obj[keyPath];
  }
  const segments = keyPath.split(".");
  let current: any = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function resolvePluralOrDirectValue(
  bundle: Record<string, any> | undefined,
  key: string,
  params?: TranslationParams,
  locale: string = "en"
): string | undefined {
  if (!bundle) return undefined;

  if (params && typeof params.count === "number") {
    if (params.count === 0) {
      const zeroVal = lookupNestedValue(bundle, \`\${key}_zero\`);
      if (typeof zeroVal === "string") return zeroVal;
    }
    const category = getPluralRules(locale).select(params.count);
    const pluralVal = lookupNestedValue(bundle, \`\${key}_\${category}\`);
    if (typeof pluralVal === "string") return pluralVal;

    const otherVal = lookupNestedValue(bundle, \`\${key}_other\`);
    if (typeof otherVal === "string") return otherVal;
  }

  const directVal = lookupNestedValue(bundle, key);
  return typeof directVal === "string" ? directVal : undefined;
}

function interpolateTemplate(template: string, params?: TranslationParams): string {
  if (!params || typeof params !== "object") return template;
  return template.replace(/\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}/g, (fullMatch, tokenPath) => {
    const val = lookupNestedValue(params as Record<string, any>, tokenPath);
    if (val === undefined || val === null) {
      return fullMatch;
    }
    return String(val);
  });
}

export function defineI18n<
  TResources extends Record<string, Record<string, any>>,
  TDefaultLocale extends keyof TResources & string = keyof TResources & string
>(
  config: I18nConfig<TResources>
): I18nInstance<Paths<TResources[TDefaultLocale]>> {
  const rawResources = (config?.resources || config?.locales || {}) as Record<string, Record<string, any>>;
  const resources: Record<string, Record<string, any>> = {};
  for (const [loc, dict] of Object.entries(rawResources)) {
    const baseLang = loc.split("-")[0].toLowerCase();
    const builtinCommon = BUILTIN_COMMON_MESSAGES[loc] || BUILTIN_COMMON_MESSAGES[baseLang] || BUILTIN_COMMON_MESSAGES.en;
    resources[loc] = {
      ...builtinCommon,
      ...dict,
      common: {
        ...(builtinCommon?.common || {}),
        ...(dict?.common || {}),
        errors: {
          ...(builtinCommon?.common?.errors || {}),
          ...(dict?.common?.errors || {}),
        },
        validation: {
          ...(builtinCommon?.common?.validation || {}),
          ...(dict?.common?.validation || {}),
          zod: {
            ...(builtinCommon?.common?.validation?.zod || {}),
            ...(dict?.common?.validation?.zod || {}),
          },
        },
      },
    };
  }
  const locales = Object.keys(resources);

  const requestedDefault = config?.defaultLocale || APP_DEFAULT_LOCALE || locales[0] || "en";
  const defaultLocale =
    matchSupportedLocale(requestedDefault, locales) || locales[0] || requestedDefault;
  const fallbackLocale =
    (config?.fallbackLocale && matchSupportedLocale(config.fallbackLocale, locales)) ||
    defaultLocale;

  const detectOrder: LocaleDetectionSource[] = Array.isArray(config?.detect) && config.detect.length > 0
    ? config.detect
    : ["query", "header", "accept-language", "auth", "payload"];
  const queryParam = config?.queryParam || "lang";
  const headerName = config?.header || "x-lang";

  function resolveLocale(event: any): string {
    if (!event || typeof event !== "object" || locales.length === 0) {
      return defaultLocale;
    }

    for (const source of detectOrder) {
      if (source === "query") {
        const qParams = event.queryStringParameters;
        const candidate =
          qParams?.[queryParam] ?? (queryParam === "lang" ? qParams?.locale : undefined);
        const matched = matchSupportedLocale(candidate, locales);
        if (matched) return matched;
      } else if (source === "header") {
        const candidate =
          getCaseInsensitiveHeader(event.headers, headerName) ??
          (headerName === "x-lang"
            ? getCaseInsensitiveHeader(event.headers, "x-locale")
            : undefined);
        const matched = matchSupportedLocale(candidate, locales);
        if (matched) return matched;
      } else if (source === "accept-language") {
        const rawAccept = getCaseInsensitiveHeader(event.headers, "accept-language");
        const candidates = parseAcceptLanguage(rawAccept);
        for (const candidate of candidates) {
          const matched = matchSupportedLocale(candidate, locales);
          if (matched) return matched;
        }
      } else if (source === "auth") {
        const authObj =
          event.auth ||
          event.requestContext?.authorizer?.lambda ||
          event.requestContext?.authorizer;
        const candidate = authObj?.locale ?? authObj?.lang;
        const matched = matchSupportedLocale(candidate, locales);
        if (matched) return matched;
      } else if (source === "payload") {
        const payloadObj =
          event.payload && typeof event.payload === "object" ? event.payload : undefined;
        const candidate = payloadObj?.locale ?? payloadObj?.lang;
        const matched = matchSupportedLocale(candidate, locales);
        if (matched) return matched;
      }
    }

    return defaultLocale;
  }

  function buildCandidateChain(activeLocale: string): string[] {
    const chain: string[] = [];
    const pushUnique = (loc?: string) => {
      if (loc && !chain.includes(loc)) chain.push(loc);
    };

    const matchedActive = matchSupportedLocale(activeLocale, locales) || activeLocale;
    pushUnique(matchedActive);

    if (matchedActive.includes("-")) {
      const base = matchSupportedLocale(matchedActive.split("-")[0], locales);
      pushUnique(base);
    }

    pushUnique(fallbackLocale);
    pushUnique(defaultLocale);
    return chain;
  }

  function t(
    key: string,
    params?: TranslationParams,
    locale: string = defaultLocale
  ): string {
    const chain = buildCandidateChain(locale);
    for (const candidateLocale of chain) {
      const bundle = resources[candidateLocale];
      const resolved = resolvePluralOrDirectValue(bundle, key, params, candidateLocale);
      if (resolved !== undefined) {
        return interpolateTemplate(resolved, params);
      }
    }
    return interpolateTemplate(String(key), params);
  }

  function has(key: string, locale: string = defaultLocale): boolean {
    const chain = buildCandidateChain(locale);
    for (const candidateLocale of chain) {
      const bundle = resources[candidateLocale];
      if (resolvePluralOrDirectValue(bundle, key, undefined, candidateLocale) !== undefined) {
        return true;
      }
    }
    return false;
  }

  function translator(locale: string = defaultLocale) {
    return (key: string, params?: TranslationParams) => t(key, params, locale);
  }

  function formatNumber(
    value: number,
    locale: string = defaultLocale,
    options?: Intl.NumberFormatOptions
  ): string {
    return new Intl.NumberFormat(locale, options).format(value);
  }

  function formatCurrency(
    value: number,
    currency: string,
    locale: string = defaultLocale,
    options?: Intl.NumberFormatOptions
  ): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...options,
    }).format(value);
  }

  function formatDate(
    value: Date | number | string,
    locale: string = defaultLocale,
    options?: Intl.DateTimeFormatOptions
  ): string {
    const dateObj = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  }

  return {
    __fastlbsI18n: true,
    defaultLocale,
    fallbackLocale,
    locales,
    resources,
    resolveLocale,
    translator,
    createTranslator: translator,
    t,
    has,
    formatNumber,
    formatCurrency,
    formatDate,
  };
}
`;
}

/**
 * Ensures `libs/common/i18n/index.ts` and `libs/common/i18n/locales/*.json` exist in a project.
 * Idempotent: does not overwrite existing locale files, and updates APP_DEFAULT_LOCALE if changed.
 */
export function ensureCommonI18n(projectRoot, options = {}) {
    const defaultLocale = normalizeLocaleTag(options.defaultLocale || 'en');
    const locales = parseLocalesList(options.locales, [defaultLocale, 'es']);
    if (!locales.includes(defaultLocale)) {
        locales.unshift(defaultLocale);
    }

    const i18nDir = path.join(projectRoot, 'libs', 'common', 'i18n');
    const localesDir = path.join(i18nDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });

    const indexPath = path.join(i18nDir, 'index.ts');
    if (!fs.existsSync(indexPath) || options.overwriteRuntime) {
        fs.writeFileSync(indexPath, buildCommonI18nRuntimeContent(defaultLocale), 'utf-8');
    } else {
        // Sync APP_DEFAULT_LOCALE if it changed in fastlbs.config.json
        const existingContent = fs.readFileSync(indexPath, 'utf-8');
        const updatedContent = existingContent.replace(
            /export const APP_DEFAULT_LOCALE\s*=\s*["'][^"']+["'];/,
            `export const APP_DEFAULT_LOCALE = "${defaultLocale}";`
        );
        if (updatedContent !== existingContent) {
            fs.writeFileSync(indexPath, updatedContent, 'utf-8');
        }
    }

    const createdLocales = [];
    for (const locale of locales) {
        const localeFilePath = path.join(localesDir, `${locale}.json`);
        if (!fs.existsSync(localeFilePath)) {
            const template = getCommonLocaleTemplate(locale, defaultLocale);
            fs.writeFileSync(localeFilePath, `${JSON.stringify(template, null, 2)}\n`, 'utf-8');
            createdLocales.push(locale);
        }
    }

    return {
        i18nDir,
        localesDir,
        indexPath,
        createdLocales,
    };
}

export function createBaseI18n(projectName, options = {}) {
    const projectRoot = path.join(process.cwd(), projectName);
    return ensureCommonI18n(projectRoot, options);
}
