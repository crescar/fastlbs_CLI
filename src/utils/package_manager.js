import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { FastlbsError } from './cli_error.js';

export const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'];

const LOCKFILE_CANDIDATES = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
];

/**
 * Normalizes a raw package manager name to one of: 'npm' | 'pnpm' | 'yarn', or null if invalid.
 */
export function normalizePackageManager(raw) {
    if (typeof raw !== 'string') {
        return null;
    }
    const normalized = raw.trim().toLowerCase();
    return SUPPORTED_PACKAGE_MANAGERS.includes(normalized) ? normalized : null;
}

/**
 * Validates a package manager name and throws a FastlbsError if unsupported.
 */
export function assertValidPackageManager(raw) {
    const normalized = normalizePackageManager(raw);
    if (!normalized) {
        throw new FastlbsError(`Invalid package manager "${raw}".`, {
            code: 'INVALID_PACKAGE_MANAGER',
            hint: `Supported package managers are: ${SUPPORTED_PACKAGE_MANAGERS.join(', ')}.`,
        });
    }
    return normalized;
}

/**
 * Detects the invoking package manager from npm_config_user_agent (e.g., pnpm dlx / npx / yarn).
 * Falls back to 'npm' when unknown or absent.
 */
export function detectPackageManagerFromUserAgent(userAgent = process.env.npm_config_user_agent) {
    if (typeof userAgent !== 'string' || !userAgent.trim()) {
        return 'npm';
    }
    const firstToken = userAgent.trim().toLowerCase().split(/[\s/]+/)[0];
    return SUPPORTED_PACKAGE_MANAGERS.includes(firstToken) ? firstToken : 'npm';
}

/**
 * Detects a package manager from existing lockfiles in the project root.
 */
export function detectPackageManagerFromLockfile(projectRoot) {
    if (!projectRoot) {
        return null;
    }
    for (const [lockfile, pm] of LOCKFILE_CANDIDATES) {
        if (fs.existsSync(path.join(projectRoot, lockfile))) {
            return pm;
        }
    }
    return null;
}

/**
 * Parses the major version number from a semver string, or null if unavailable.
 */
export function getPackageManagerMajorVersion(version) {
    if (typeof version !== 'string') {
        return null;
    }
    const match = version.trim().match(/^v?(\d+)\./);
    return match ? Number(match[1]) : null;
}

/**
 * Parses major version from a semver string and returns true for Yarn Berry (v2+).
 */
export function isYarnBerry(version) {
    const major = getPackageManagerMajorVersion(version);
    return major !== null && major >= 2;
}

/**
 * Returns the installed CLI version string for a supported package manager, or null if unavailable.
 */
export function getPackageManagerVersion(pm) {
    const normalized = normalizePackageManager(pm);
    if (!normalized) {
        return null;
    }

    const result = spawnSync(`${normalized} --version`, {
        shell: true,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0 || typeof result.stdout !== 'string') {
        return null;
    }

    const firstLine = result.stdout.trim().split(/\r?\n/)[0]?.trim();
    return firstLine || null;
}

/**
 * Ensures the chosen package manager binary is installed and returns its version string.
 */
export function assertPackageManagerInstalled(pm) {
    const validPm = assertValidPackageManager(pm);
    const version = getPackageManagerVersion(validPm);

    if (!version) {
        const hint =
            validPm === 'npm'
                ? 'Ensure Node.js and npm are installed and available on your PATH.'
                : `Install ${validPm} globally or enable Corepack ("corepack enable"), or choose another package manager with --package-manager.`;
        throw new FastlbsError(`Package manager "${validPm}" is not installed or not available in PATH.`, {
            code: 'PACKAGE_MANAGER_NOT_FOUND',
            hint,
        });
    }

    return version;
}

/**
 * Resolves the package manager for an existing FastLBS project.
 * Priority: fastlbs.config.json -> lockfile -> package.json#packageManager -> 'npm'.
 */
export function resolvePackageManager(projectRoot) {
    if (!projectRoot) {
        return 'npm';
    }

    const fastlbsConfigPath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(fastlbsConfigPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(fastlbsConfigPath, 'utf-8'));
            const fromConfig = normalizePackageManager(cfg?.packageManager);
            if (fromConfig) {
                return fromConfig;
            }
        } catch {
            // Ignore malformed config and fall through to lockfile detection
        }
    }

    const fromLockfile = detectPackageManagerFromLockfile(projectRoot);
    if (fromLockfile) {
        return fromLockfile;
    }

    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (typeof pkg?.packageManager === 'string') {
                const namePart = pkg.packageManager.split('@')[0];
                const fromPkg = normalizePackageManager(namePart);
                if (fromPkg) {
                    return fromPkg;
                }
            }
        } catch {
            // Ignore malformed package.json
        }
    }

    return 'npm';
}

/**
 * Checks whether a project is configured for Yarn Berry (v2+).
 */
export function isProjectYarnBerry(projectRoot) {
    if (projectRoot && fs.existsSync(path.join(projectRoot, '.yarnrc.yml'))) {
        return true;
    }
    if (projectRoot) {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (typeof pkg?.packageManager === 'string' && pkg.packageManager.startsWith('yarn@')) {
                    return isYarnBerry(pkg.packageManager.slice('yarn@'.length));
                }
            } catch {
                // Ignore
            }
        }
    }
    return isYarnBerry(getPackageManagerVersion('yarn'));
}

/**
 * Returns normalized command builders and hints for a given package manager.
 */
export function getPackageManagerCommands(pm, { yarnBerry = false } = {}) {
    const validPm = normalizePackageManager(pm) || 'npm';

    const commandMap = {
        npm: {
            install: ['npm', ['install']],
            installCommandString: 'npm install',
            run: (script) => ['npm', ['run', script]],
            exec: (bin, args = []) => ['npx', [bin, ...args]],
            prodInstall: 'npm install --omit=dev',
        },
        pnpm: {
            install: ['pnpm', ['install']],
            installCommandString: 'pnpm install',
            run: (script) => ['pnpm', ['run', script]],
            exec: (bin, args = []) => ['pnpm', ['exec', bin, ...args]],
            prodInstall: 'pnpm install --prod',
        },
        yarn: {
            install: ['yarn', ['install']],
            installCommandString: 'yarn install',
            run: (script) => ['yarn', ['run', script]],
            exec: (bin, args = []) => ['yarn', [bin, ...args]],
            prodInstall: yarnBerry ? 'yarn workspaces focus --production' : 'yarn install --production',
        },
    };

    return commandMap[validPm];
}
