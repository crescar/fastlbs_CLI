import path from 'path';
import { FastlbsError } from './cli_error.js';

const LAMBDA_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

export function assertValidLambdaName(lambdaName) {
    if (typeof lambdaName !== 'string' || !lambdaName.trim()) {
        throw new FastlbsError('Lambda name is required.', {
            code: 'INVALID_LAMBDA_NAME',
            hint: 'Use: fastlbs <command> <lambda-name>',
        });
    }

    if (!LAMBDA_NAME_REGEX.test(lambdaName)) {
        throw new FastlbsError(
            `Invalid lambda name "${lambdaName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_LAMBDA_NAME',
                hint: 'Avoid spaces, slashes and dots in lambda names.',
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
            hint: 'Check lambda name and command arguments.',
        });
    }
}
