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
