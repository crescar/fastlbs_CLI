import fs from 'fs';
import path from 'path';
import { nameToKebabCase } from "../../../utils/hanlders_name.js";

function creatPackageJson(projectName) {
    const content = {
        "name": nameToKebabCase(projectName),
        "version": "1.0.0",
        "description": "",
        "main": "",
        "workspaces": [
            "lambdas/*",
            "libs/*"
        ],
        "keywords": [],
        "author": "",
        "license": "ISC",
        "dependencies": {
            "@types/swagger-ui-dist": "^3.30.6",
            "aws-lambda": "^1.0.7",
            "swagger-ui-dist": "^5.32.6"
        },
        "devDependencies": {
            "@types/aws-lambda": "^8.10.161",
            "@types/jest": "^30.0.0",
            "dotenv": "^16.4.7",
            "jest": "^30.4.2",
            "serverless": "^3.38.0",
            "serverless-offline": "^13.10.0",
            "ts-jest": "^29.4.9"
        },
        "scripts": {
            "start": "serverless offline start -t"
        },
        "type": "module"
    }
    const filePath = path.join(process.cwd(), projectName, 'package.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function createTsConfig(projectName) {
    const content = {
        "compilerOptions": {
            "sourceMap": true,
            "target": "es2022",
            "module": "NodeNext",
            "moduleResolution": "NodeNext",
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
    }
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
    
`
    const filePath = path.join(process.cwd(), projectName, 'jest.config.ts');
    fs.writeFileSync(filePath, content);
}

function createFastLbsConfig(projectName) {
    const content = {
        "service": projectName,
        "frameworkVersion": "1",
        "lambdas": {},
    }
    const filePath = path.join(process.cwd(), projectName, 'fastlbs.config.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

export function createConfigurations(projectName) {
    creatPackageJson(projectName);
    createTsConfig(projectName);
    createJestConfig(projectName);
    createFastLbsConfig(projectName);
}