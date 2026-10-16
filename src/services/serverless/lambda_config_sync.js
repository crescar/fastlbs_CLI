import fs from 'fs';
import path from 'path';
import { findMatchingToken } from '../docs/doc_manager.js';

/**
 * Parses @fastlbs JSDoc comment blocks from a lambda's TypeScript source code.
 */
export function parseJsDocAnnotations(sourceCode) {
    const commentBlocks = [...sourceCode.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
    let method = null;
    let routePath = null;
    let cors = undefined;
    let events_authorizer = null;
    const rawEvents = [];
    const docMeta = {};

    for (const match of commentBlocks) {
        const block = match[1];
        const hasFastlbsTag =
            /@fastlbs\b/i.test(block) ||
            /@(?:method|path|route|event|summary|tags?|auth|security|authorizer)\b/i.test(block);

        if (!hasFastlbsTag) {
            continue;
        }

        const lines = block
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*\*\s?/, '').trim());

        let authorizer = null;

        for (const line of lines) {
            const methodMatch = line.match(/^@method\s+([A-Za-z]+)/i);
            if (methodMatch) {
                method = methodMatch[1].toLowerCase();
                continue;
            }

            const pathMatch = line.match(/^@(?:path|route)\s+(\S+)/i);
            if (pathMatch) {
                routePath = pathMatch[1].trim();
                continue;
            }

            const corsMatch = line.match(/^@cors\s+(true|false)/i);
            if (corsMatch) {
                cors = corsMatch[1].toLowerCase() === 'true';
                continue;
            }

            const authorizerMatch = line.match(/^@authorizer\s+(\S+)/i);
            if (authorizerMatch) {
                authorizer = authorizerMatch[1].trim();
                continue;
            }

            const eventMatch = line.match(/^@event\s+(.+)$/i);
            if (eventMatch) {
                try {
                    rawEvents.push(JSON.parse(eventMatch[1].trim()));
                } catch {
                    // Ignore malformed JSON in @event
                }
                continue;
            }

            const summaryMatch = line.match(/^@summary\s+(.+)$/i);
            if (summaryMatch) {
                docMeta.summary = summaryMatch[1].trim();
                continue;
            }

            const descMatch = line.match(/^@description\s+(.+)$/i);
            if (descMatch) {
                docMeta.description = descMatch[1].trim();
                continue;
            }

            const tagsMatch = line.match(/^@tags?\s+(.+)$/i);
            if (tagsMatch) {
                docMeta.tags = tagsMatch[1]
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);
                continue;
            }

            const authMatch = line.match(/^@(?:auth|security)\s+(.+)$/i);
            if (authMatch) {
                docMeta.security = authMatch[1]
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                continue;
            }
        }

        if (authorizer && method && routePath) {
            events_authorizer = authorizer;
        }
    }

    const events = [...rawEvents];
    if (method && routePath) {
        events.unshift({
            type: 'http',
            method,
            path: routePath,
            ...(cors !== undefined ? { cors } : { cors: true }),
            ...(events_authorizer ? { authorizer: events_authorizer } : {}),
        });
    }

    return {
        events: events.length > 0 ? events : null,
        docMeta: Object.keys(docMeta).length > 0 ? docMeta : null,
    };
}

/**
 * Extracts a balanced object or array literal assigned to a property key inside an object literal string.
 */
function extractPropertyBlock(objectLiteralStr, propName) {
    const propRegex = new RegExp(`(?:^|[,{\\s])${propName}\\s*:\\s*([\\[{])`, 'm');
    const match = objectLiteralStr.match(propRegex);
    if (!match || match.index === undefined) {
        return null;
    }

    const openChar = match[1];
    const closeChar = openChar === '{' ? '}' : ']';
    const openIndex = match.index + match[0].lastIndexOf(openChar);
    const closeIndex = findMatchingToken(objectLiteralStr, openIndex, openChar, closeChar);
    if (closeIndex === -1) {
        return null;
    }

    return objectLiteralStr.slice(openIndex, closeIndex + 1);
}

/**
 * Parses a relaxed JS/TS object literal containing static primitive/array/object properties
 * (such as event config `{ method: "GET", path: "v1/greeting", cors: true }`).
 */
function parseSimpleObjectLiteral(blockStr) {
    if (!blockStr) return null;

    // 1. Try relaxed JSON normalization for pure data blocks
    try {
        const jsonCandidate = blockStr
            // Remove single-line and multi-line comments
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Convert single-quoted strings to double-quoted strings
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`)
            // Quote unquoted property keys
            .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
            // Remove trailing commas before } or ]
            .replace(/,\s*([}\]])/g, '$1');

        return JSON.parse(jsonCandidate);
    } catch {
        // Fallback to regex field extraction when dynamic identifiers (e.g. response: SchemaIdentifier) exist
        // Strip nested sub-objects (e.g. errors: { 400: { description: ... } }) so nested keys don't shadow top-level keys
        let topLevelStr = blockStr;
        const errorsBlock = extractPropertyBlock(topLevelStr, 'errors');
        if (errorsBlock) {
            topLevelStr = topLevelStr.replace(errorsBlock, '{}');
        }

        const extracted = {};

        const stringProps = ['type', 'method', 'path', 'rate', 'arn', 'bucket', 'event', 'summary', 'description', 'authorizer'];
        for (const prop of stringProps) {
            const m = topLevelStr.match(new RegExp(`\\b${prop}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
            if (m) {
                extracted[prop] = m[1];
            }
        }

        const boolProps = ['cors', 'enabled'];
        for (const prop of boolProps) {
            const m = topLevelStr.match(new RegExp(`\\b${prop}\\s*:\\s*(true|false)\\b`));
            if (m) {
                extracted[prop] = m[1] === 'true';
            }
        }

        const numProps = ['batchSize', 'statusCode'];
        for (const prop of numProps) {
            const m = topLevelStr.match(new RegExp(`\\b${prop}\\s*:\\s*(\\d+)\\b`));
            if (m) {
                extracted[prop] = Number(m[1]);
            }
        }

        const tagsMatch = topLevelStr.match(/\btags\s*:\s*\[([^\]]*)\]/);
        if (tagsMatch) {
            extracted.tags = [...tagsMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
        }

        const secMatch = topLevelStr.match(/\bsecurity\s*:\s*\[([^\]]*)\]/);
        if (secMatch) {
            extracted.security = [...secMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
        }

        return Object.keys(extracted).length > 0 ? extracted : null;
    }
}

/**
 * Extracts `event` and `doc` configurations from `handlerResponse({ ... }, ...)` in source code.
 */
export function parseHandlerResponseOptions(sourceCode) {
    const callRegex = /\b(?:handlerResponse|handlerAuthorizer|handlerAuxiliary)\s*(?:<[\s\S]*?>)?\s*\(\s*\{/m;
    const match = sourceCode.match(callRegex);
    if (!match || match.index === undefined) {
        return { events: null, docMeta: null };
    }

    const openBraceIndex = match.index + match[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingToken(sourceCode, openBraceIndex, '{', '}');
    if (closeBraceIndex === -1) {
        return { events: null, docMeta: null };
    }

    const optionsObjectStr = sourceCode.slice(openBraceIndex, closeBraceIndex + 1);

    const eventBlockStr = extractPropertyBlock(optionsObjectStr, 'event');
    const docBlockStr = extractPropertyBlock(optionsObjectStr, 'doc');
    const topLevelAuthorizerMatch = optionsObjectStr.match(/\bauthorizer\s*:\s*["'`]([^"'`]+)["'`]/);
    const topLevelAuthorizer = topLevelAuthorizerMatch ? topLevelAuthorizerMatch[1] : null;

    let events = null;
    if (eventBlockStr) {
        const parsedEvent = parseSimpleObjectLiteral(eventBlockStr);
        if (parsedEvent) {
            events = Array.isArray(parsedEvent) ? parsedEvent : [parsedEvent];
            if (topLevelAuthorizer) {
                events = events.map((evt) =>
                    (!evt.type || evt.type === 'http') && !evt.authorizer
                        ? { ...evt, authorizer: topLevelAuthorizer }
                        : evt
                );
            }
        }
    }

    let docMeta = null;
    if (docBlockStr) {
        docMeta = parseSimpleObjectLiteral(docBlockStr);
    }

    const eventAuthorizer = events && events[0]?.authorizer;
    const authorizerName =
        typeof eventAuthorizer === 'string'
            ? eventAuthorizer
            : eventAuthorizer?.name || topLevelAuthorizer;
    if (authorizerName) {
        docMeta = docMeta || {};
        docMeta.authorizer = authorizerName;
    }

    return { events, docMeta };
}

function normalizeAuthorizerObject(rawAuthorizer) {
    if (!rawAuthorizer) return undefined;
    if (typeof rawAuthorizer === 'string') {
        return {
            name: rawAuthorizer,
            resultTtlInSeconds: 0,
            identitySource: 'method.request.header.Authorization',
            type: 'request',
        };
    }
    if (typeof rawAuthorizer === 'object' && rawAuthorizer.name) {
        return {
            resultTtlInSeconds: 0,
            identitySource: 'method.request.header.Authorization',
            type: 'request',
            ...rawAuthorizer,
        };
    }
    return undefined;
}

/**
 * Converts FastLBS shorthand event configs into Serverless Framework's `events` array structure.
 */
export function normalizeServerlessEvents(rawEvents) {
    if (!rawEvents) return null;
    const list = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
    const normalized = [];

    for (const evt of list) {
        if (!evt || typeof evt !== 'object') continue;

        // Already a raw Serverless event (e.g. { http: ... }, { schedule: ... }, { sqs: ... })
        if (evt.http || evt.schedule || evt.sqs || evt.s3 || evt.sns || evt.eventBridge || evt.websocket) {
            if (evt.http && typeof evt.http === 'object' && evt.http.path) {
                const authorizerObj = normalizeAuthorizerObject(evt.http.authorizer);
                normalized.push({
                    http: {
                        ...evt.http,
                        method: String(evt.http.method || 'get').toLowerCase(),
                        path: String(evt.http.path).replace(/^\/+/, ''),
                        cors: evt.http.cors !== undefined ? Boolean(evt.http.cors) : true,
                        ...(authorizerObj ? { authorizer: authorizerObj } : {}),
                    },
                });
            } else {
                normalized.push(evt);
            }
            continue;
        }

        const eventType = evt.type ? String(evt.type).toLowerCase() : 'http';

        if (eventType === 'http' && evt.method && evt.path) {
            const authorizerObj = normalizeAuthorizerObject(evt.authorizer);
            normalized.push({
                http: {
                    method: String(evt.method).toLowerCase(),
                    path: String(evt.path).replace(/^\/+/, ''),
                    cors: evt.cors !== undefined ? Boolean(evt.cors) : true,
                    ...(authorizerObj ? { authorizer: authorizerObj } : {}),
                },
            });
        } else if (eventType === 'schedule' && evt.rate) {
            normalized.push(
                evt.enabled !== undefined
                    ? { schedule: { rate: evt.rate, enabled: Boolean(evt.enabled) } }
                    : { schedule: evt.rate }
            );
        } else if (eventType === 'sqs' && evt.arn) {
            normalized.push({
                sqs: {
                    arn: evt.arn,
                    ...(evt.batchSize !== undefined ? { batchSize: Number(evt.batchSize) } : {}),
                },
            });
        } else if (eventType === 's3' && evt.bucket) {
            normalized.push({
                s3: {
                    bucket: evt.bucket,
                    ...(evt.event ? { event: evt.event } : {}),
                },
            });
        }
    }

    return normalized.length > 0 ? normalized : null;
}

/**
 * Extracts combined event and documentation metadata from a lambda's source code.
 */
export function extractLambdaMetadataFromSource(sourceCode) {
    const isAuthorizer = /\bhandlerAuthorizer\s*(?:<[\s\S]*?>)?\s*\(/m.test(sourceCode);
    const isAuxiliary = /\bhandlerAuxiliary\s*(?:<[\s\S]*?>)?\s*\(/m.test(sourceCode);
    const lambdaKind = isAuthorizer ? 'authorizer' : isAuxiliary ? 'auxiliary' : 'http';
    const isNonHttpHelper = lambdaKind !== 'http';
    const jsDoc = parseJsDocAnnotations(sourceCode);
    const handlerOpts = parseHandlerResponseOptions(sourceCode);

    const rawEvents = handlerOpts.events || jsDoc.events;
    const normalizedEvents = normalizeServerlessEvents(rawEvents);
    const events = normalizedEvents || (isNonHttpHelper ? [] : null);

    const mergedDocMeta = {
        ...(jsDoc.docMeta || {}),
        ...(handlerOpts.docMeta || {}),
    };

    return {
        lambdaKind,
        isNonHttpHelper,
        events,
        docMeta: Object.keys(mergedDocMeta).length > 0 ? mergedDocMeta : null,
    };
}

/**
 * Synchronizes `serverlessConfig/functions/<lambdaName>.json` from `lambdas/<lambdaName>/src/index.ts`.
 * Only writes to disk if content actually changed, preventing infinite file-watcher loops.
 */
export function syncLambdaFunctionConfig(projectRoot, lambdaName) {
    if (!lambdaName || lambdaName === '__doc__') {
        return false;
    }

    const lambdaEntryPath = path.join(projectRoot, 'lambdas', lambdaName, 'src', 'index.ts');
    if (!fs.existsSync(lambdaEntryPath)) {
        return false;
    }

    const sourceCode = fs.readFileSync(lambdaEntryPath, 'utf-8');
    const { isNonHttpHelper, events, docMeta } = extractLambdaMetadataFromSource(sourceCode);

    const functionsDir = path.join(projectRoot, 'serverlessConfig', 'functions');
    fs.mkdirSync(functionsDir, { recursive: true });
    const functionConfigPath = path.join(functionsDir, `${lambdaName}.json`);

    let existingRaw = '';
    let existingConfig = {};
    if (fs.existsSync(functionConfigPath)) {
        existingRaw = fs.readFileSync(functionConfigPath, 'utf-8');
        try {
            existingConfig = JSON.parse(existingRaw);
        } catch {
            existingConfig = {};
        }
    }

    const currentFnBlock = existingConfig[lambdaName] || {};
    const resolvedEvents = events
        ? events
        : isNonHttpHelper
        ? currentFnBlock.events || []
        : currentFnBlock.events || [
              {
                  http: {
                      method: 'get',
                      path: `v1/${lambdaName}`,
                      cors: true,
                  },
              },
          ];

    const updatedFnBlock = {
        ...currentFnBlock,
        handler: currentFnBlock.handler || `dist/${lambdaName}/index.handler`,
        events: resolvedEvents,
    };

    if (docMeta) {
        updatedFnBlock._docMeta = docMeta;
    }

    const updatedConfig = {
        [lambdaName]: updatedFnBlock,
    };

    const serialized = JSON.stringify(updatedConfig, null, 2);
    if (serialized.trim() !== existingRaw.trim()) {
        fs.writeFileSync(functionConfigPath, serialized, 'utf-8');
        return true;
    }

    return false;
}

/**
 * Synchronizes all lambdas found in `lambdas/` directory with their `serverlessConfig/functions/*.json` files.
 */
export function syncAllLambdasConfig(projectRoot) {
    const lambdasDir = path.join(projectRoot, 'lambdas');
    if (!fs.existsSync(lambdasDir)) {
        return;
    }

    const entries = fs.readdirSync(lambdasDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== '__doc__') {
            syncLambdaFunctionConfig(projectRoot, entry.name);
        }
    }
}

