import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toDocConstName(lambdaName) {
    const pascalName = lambdaName
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('');

    return `${pascalName || lambdaName}Doc`;
}

function generateDocContent(lambdaName, lambdaPath, method) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();
    const docsDir = path.join(projectRoot, 'lambdas/__doc__/src/documents/lambdas');
    assertPathInsideProject(projectRoot, docsDir, 'docs directory');
    const docConstName = toDocConstName(lambdaName);
    if (!lambdaPath.startsWith('/')) {
        lambdaPath = '/' + lambdaPath;
    }
    const content = `
export const ${docConstName} = {
    "${lambdaPath}": {
        "${method.toLowerCase()}": {
            "summary": "Basic ${lambdaName} Lambda function",
            "description": "This is a basic Lambda function created for ${lambdaName}.",
            "tags": ["${lambdaName.toUpperCase()}"],
            "responses": {
                "200": {
                    "description": "Successful response",
                    "content": {
                        "application/json": {
                            "example": {
                                "status": "success",
                                "message": "Request successful",
                                "data": {
                                    "greeting": "Hello, World! from lambda ${lambdaName}"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}     
`
    fs.mkdirSync(docsDir, { recursive: true });
    const docPath = path.join(docsDir, `${lambdaName}.ts`);
    fs.writeFileSync(docPath, content, 'utf-8');
}

function findMatchingToken(content, openIndex, openChar, closeChar) {
    let depth = 0;
    let inString = false;
    let stringDelimiter = '';
    let escaped = false;

    for (let i = openIndex; i < content.length; i++) {
        const ch = content[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === stringDelimiter) {
                inString = false;
                stringDelimiter = '';
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringDelimiter = ch;
            continue;
        }

        if (ch === openChar) {
            depth += 1;
            continue;
        }

        if (ch === closeChar) {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function addDocToPathsArray(indexContent, docConstName) {
    const pathsMatch = indexContent.match(/const\s+paths(?:\s*:[^=]+)?\s*=\s*\[/m);
    if (!pathsMatch || pathsMatch.index === undefined) {
        return indexContent;
    }

    const openBracketIndex = pathsMatch.index + pathsMatch[0].lastIndexOf('[');
    const closeBracketIndex = findMatchingToken(indexContent, openBracketIndex, '[', ']');

    if (closeBracketIndex === -1) {
        return indexContent;
    }

    const pathsBody = indexContent.slice(openBracketIndex + 1, closeBracketIndex);
    const escapedConstName = docConstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const arrayItemRegex = new RegExp(`\\b${escapedConstName}\\b`);
    if (arrayItemRegex.test(pathsBody)) {
        return indexContent;
    }

    const lineStart = indexContent.lastIndexOf('\n', openBracketIndex) + 1;
    const pathsLine = indexContent.slice(lineStart, openBracketIndex);
    const baseIndent = (pathsLine.match(/^\s*/) || [''])[0];
    const entryIndent = `${baseIndent}    `;

    let newPathsBody = pathsBody;
    const trimmedBody = pathsBody.trim();

    if (trimmedBody.length === 0) {
        newPathsBody = `\n${entryIndent}${docConstName}\n${baseIndent}`;
    } else {
        const trailingWhitespaceMatch = pathsBody.match(/\s*$/);
        const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';
        let bodyWithoutTrailingWs = pathsBody.slice(0, pathsBody.length - trailingWhitespace.length);

        let endIndex = bodyWithoutTrailingWs.length - 1;
        while (endIndex >= 0 && /\s/.test(bodyWithoutTrailingWs[endIndex])) {
            endIndex -= 1;
        }

        if (endIndex >= 0 && bodyWithoutTrailingWs[endIndex] !== ',') {
            bodyWithoutTrailingWs = `${bodyWithoutTrailingWs.slice(0, endIndex + 1)},${bodyWithoutTrailingWs.slice(endIndex + 1)}`;
        }

        newPathsBody = `${bodyWithoutTrailingWs}\n${entryIndent}${docConstName}${trailingWhitespace}`;
    }

    return `${indexContent.slice(0, openBracketIndex + 1)}${newPathsBody}${indexContent.slice(closeBracketIndex)}`;
}

export function createBaseDoc(lambdaName, lambdaPath, method) {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();
    generateDocContent(lambdaName, lambdaPath, method);
    const indexPath = path.join(projectRoot, 'lambdas/__doc__/src/documents/index.ts');
    assertPathInsideProject(projectRoot, indexPath, 'docs index file');
    let indexContent = fs.readFileSync(indexPath, 'utf-8');

    const docConstName = toDocConstName(lambdaName);
    const importStatement = `import { ${docConstName} } from "./lambdas/${lambdaName}";`;

    if (!indexContent.includes(importStatement)) {
        const importMatches = [...indexContent.matchAll(/^import\s.+;$/gm)];
        if (importMatches.length > 0) {
            const lastImport = importMatches[importMatches.length - 1];
            const insertAt = (lastImport.index ?? 0) + lastImport[0].length;
            indexContent = `${indexContent.slice(0, insertAt)}\n${importStatement}${indexContent.slice(insertAt)}`;
        } else {
            indexContent = `${importStatement}\n\n${indexContent}`;
        }
    }

    indexContent = addDocToPathsArray(indexContent, docConstName);

    fs.writeFileSync(indexPath, indexContent, 'utf-8');
}