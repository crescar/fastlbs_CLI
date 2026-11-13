import fs from 'fs';
import path from 'path';
import { nameToKebabCase } from "../../../utils/string_utils.js";
import { getPackageManagerMajorVersion, isYarnBerry } from "../../../utils/package_manager.js";

function createPackageJson(projectName, { packageManager = 'npm', packageManagerVersion = null } = {}) {
    const content = {
        "name": nameToKebabCase(projectName),
        "version": "1.0.0",
        "private": true,
        "description": "",
        "main": "",
        ...(packageManager !== 'pnpm'
            ? {
                "workspaces": [
                    "lambdas/*",
                    "libs/*"
                ]
            }
            : {}),
        ...(packageManagerVersion
            ? { "packageManager": `${packageManager}@${packageManagerVersion}` }
            : {}),
        "keywords": [],
        "author": "",
        "license": "ISC",
        "dependencies": {
            "@types/swagger-ui-dist": "^3.30.6",
            "aws-lambda": "^1.0.7",
            "swagger-ui-dist": "^5.32.6",
            "zod": "^4.4.3"
        },
        "devDependencies": {
            "@types/aws-lambda": "^8.10.161",
            "@types/jest": "^30.0.0",
            "@types/node": "^22.0.0",
            "dotenv": "^16.4.7",
            "jest": "^30.4.2",
            "serverless": "^3.38.0",
            "serverless-offline": "^13.10.0",
            "ts-jest": "^29.4.9",
            "tsx": "^4.19.3",
            "typescript": "^5.8.0"
        },
        "scripts": {
            "start": "serverless offline start -t"
        },
        "type": "module"
    };
    const filePath = path.join(process.cwd(), projectName, 'package.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function createPackageManagerFiles(projectName, { packageManager = 'npm', packageManagerVersion = null } = {}) {
    const projectRoot = path.join(process.cwd(), projectName);

    if (packageManager === 'pnpm') {
        const major = getPackageManagerMajorVersion(packageManagerVersion);
        const workspaceLines = [
            'packages:',
            "  - 'lambdas/*'",
            "  - 'libs/*'",
        ];

        // pnpm v11+ requires allowBuilds (strictDepBuilds is enabled by default);
        // pnpm v10 uses onlyBuiltDependencies / ignoredBuiltDependencies.
        if (major === null || major >= 11) {
            workspaceLines.push(
                '',
                'allowBuilds:',
                '  esbuild: true',
                '  serverless: true',
                "  '@parcel/watcher': false",
                "  '@scarf/scarf': false",
                '  aws-sdk: false',
                '  es5-ext: false'
            );
        } else if (major === 10) {
            workspaceLines.push(
                '',
                'onlyBuiltDependencies:',
                '  - esbuild',
                '  - serverless',
                'ignoredBuiltDependencies:',
                "  - '@parcel/watcher'",
                "  - '@scarf/scarf'",
                '  - aws-sdk',
                '  - es5-ext'
            );
        }

        fs.writeFileSync(
            path.join(projectRoot, 'pnpm-workspace.yaml'),
            workspaceLines.join('\n') + '\n',
            'utf-8'
        );

        // Hoisted node_modules ensures Serverless packaging (swagger-ui-dist) and Jest binary checks work seamlessly
        fs.writeFileSync(path.join(projectRoot, '.npmrc'), 'node-linker=hoisted\n', 'utf-8');
        return;
    }

    if (packageManager === 'yarn' && isYarnBerry(packageManagerVersion)) {
        fs.writeFileSync(path.join(projectRoot, '.yarnrc.yml'), 'nodeLinker: node-modules\n', 'utf-8');
    }
}

function createTsConfig(projectName) {
    const content = {
        "compilerOptions": {
            "sourceMap": true,
            "target": "es2022",
            "module": "ESNext",
            "moduleResolution": "Bundler",
            "baseUrl": ".",
            "esModuleInterop": true,
            "forceConsistentCasingInFileNames": true,
            "strict": true,
            "skipLibCheck": true,
            "composite": true,
            "declaration": true,
            "outDir": "dist",
            "resolveJsonModule": true,
            "paths": {
                [`@${projectName}/common/*`]: [
                    "./libs/common/*"
                ]
            },
            "types": ["jest", "node"]
        },
        "include": [
            "libs/**/*.ts",
            "libs/common/**/*.ts",
            "libs/**/*.json",
            "**/*.spec.ts",
            "**/*.test.ts",
            "lambdas/**/*.ts",
            "lambdas/**/*.json"
        ],
        "exclude": [
            "node_modules",
            "**/dist",
            "coverage",
            "dist",
            "**/coverage",
            "**/node_modules"
        ]
    };
    const filePath = path.join(process.cwd(), projectName, 'tsconfig.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function createJestConfig(projectName) {
    const content =
`
import type { Config } from 'jest';

const JestConfigBase: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  rootDir: process.cwd(),
  passWithNoTests: true,
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/lambdas/**/*.spec.ts",
    "<rootDir>/libs/**/*.spec.ts"
  ],
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: { allowJs: true } }]
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(axios|natural|afinn-165|afinn-165-financialmarketnews|uuid)/)"
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  roots: [
    "<rootDir>/lambdas",
    "<rootDir>/libs"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/"
  ],
  moduleNameMapper: {
    '^@${projectName}/common$': '<rootDir>/libs/common',
    '^@${projectName}/common/(.*)$': '<rootDir>/libs/common/$1'
  }
};

export default JestConfigBase;
`;
    const filePath = path.join(process.cwd(), projectName, 'jest.config.ts');
    fs.writeFileSync(filePath, content.trimStart());
}

const CLI_PACKAGE_JSON_PATH = new URL('../../../../package.json', import.meta.url);
function getCliVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(CLI_PACKAGE_JSON_PATH, 'utf-8'));
        return pkg.version || '2.0.1';
    } catch {
        return '2.0.1';
    }
}

function createFastLbsConfig(projectName, { packageManager = 'npm' } = {}) {
    const content = {
        "service": projectName,
        "frameworkVersion": "2",
        "runtimeVersion": getCliVersion(),
        "packageManager": packageManager,
        "apiGateway": "http",
        "defaultLocale": "en",
        "i18n": {
            "defaultLocale": "en",
            "locales": ["en", "es"],
            "enabledByDefault": false,
        },
        "lambdas": {},
    };
    const filePath = path.join(process.cwd(), projectName, 'fastlbs.config.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

export function createConfigurations(projectName, options = {}) {
    createPackageJson(projectName, options);
    createPackageManagerFiles(projectName, options);
    createTsConfig(projectName);
    createJestConfig(projectName);
    createFastLbsConfig(projectName, options);
}