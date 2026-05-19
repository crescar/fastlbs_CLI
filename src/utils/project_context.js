import fs from 'fs';
import path from 'path';
import { FastlbsError } from './cli_error.js';

const FASTLBS_CONFIG_FILE = 'fastlbs.config.json';

export function findProjectRoot(startDir = process.cwd()) {
    let currentDir = path.resolve(startDir);

    while (true) {
        const configPath = path.join(currentDir, FASTLBS_CONFIG_FILE);
        if (fs.existsSync(configPath)) {
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
}

export function getProjectRootOrThrow(startDir = process.cwd()) {
    const root = findProjectRoot(startDir);
    if (!root) {
        throw new FastlbsError('fastlbs.config.json not found in current directory or parent directories.', {
            code: 'PROJECT_ROOT_NOT_FOUND',
            hint: 'Run this command inside a FastLBS project.',
        });
    }

    return root;
}

export function resolveFromProject(projectRoot, ...segments) {
    return path.resolve(projectRoot, ...segments);
}
