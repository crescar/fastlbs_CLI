import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { transformSync } from 'esbuild';

function getJestConfigPath() {
	const configPath = path.join(process.cwd(), 'jest.config.ts');
	if (!fs.existsSync(configPath)) {
		throw new Error('jest.config.ts no encontrado en el directorio actual.');
	}

	return configPath;
}

async function loadBaseJestConfig() {
	const jestConfigPath = getJestConfigPath();
	const source = fs.readFileSync(jestConfigPath, 'utf-8');
	const { code } = transformSync(source, {
		loader: 'ts',
		format: 'esm',
		target: 'node22',
	});

	const tempConfigPath = path.join(process.cwd(), '.fastlbs.jest.base.config.mjs');
	fs.writeFileSync(tempConfigPath, code, 'utf-8');

	try {
		const tempConfigUrl = `${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`;
		const module = await import(tempConfigUrl);
		return module.default ?? module;
	} finally {
		if (fs.existsSync(tempConfigPath)) {
			fs.unlinkSync(tempConfigPath);
		}
	}
}

function normalizeStringArray(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item) => typeof item === 'string');
}

function mapLambdaTestMatch(testMatch, lambdaName) {
	const lambdaPattern = `<rootDir>/lambdas/${lambdaName}/**/*.spec.ts`;
	const basePatterns = normalizeStringArray(testMatch);
	let replaced = false;

	const mapped = basePatterns.map((pattern) => {
		if (pattern.includes('<rootDir>/lambdas/')) {
			replaced = true;
			return lambdaPattern;
		}
		return pattern;
	});

	if (!replaced) {
		mapped.unshift(lambdaPattern);
	}

	return [...new Set(mapped)];
}

function mapLambdaRoots(roots, lambdaName) {
	const lambdaRoot = `<rootDir>/lambdas/${lambdaName}`;
	const baseRoots = normalizeStringArray(roots);
	let replaced = false;

	const mapped = baseRoots.map((root) => {
		if (root === '<rootDir>/lambdas') {
			replaced = true;
			return lambdaRoot;
		}
		return root;
	});

	if (!replaced) {
		mapped.unshift(lambdaRoot);
	}

	return [...new Set(mapped)];
}

async function createJestConfig(lambdaName) {
	const baseConfig = await loadBaseJestConfig();
	const runAllLambdas = !lambdaName;

	if (runAllLambdas) {
		return baseConfig;
	}

	return {
		...baseConfig,
		testMatch: mapLambdaTestMatch(baseConfig.testMatch, lambdaName),
		roots: mapLambdaRoots(baseConfig.roots, lambdaName),
	};
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const processCommand = spawn(command, args, {
			stdio: 'inherit',
			shell: true,
			...options,
		});

		processCommand.on('error', reject);
		processCommand.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`Command failed with exit code ${code}`));
		});
	});
}

function getJestExecutablePath() {
	const jestBinary = process.platform === 'win32' ? 'jest.cmd' : 'jest';
	return path.join(process.cwd(), 'node_modules', '.bin', jestBinary);
}

async function ensureJestInstalled() {
	const jestExecutablePath = getJestExecutablePath();
	if (!fs.existsSync(jestExecutablePath)) {
		throw new Error('Jest no esta instalado. Ejecuta npm install para instalar las dependencias del package.json.');
	}
}

async function runJest(config) {
	await ensureJestInstalled();
	const configPath = path.join(process.cwd(), '.fastlbs.jest.config.json');
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

	try {
		await runCommand('npx', ['jest', '--config', configPath]);
	} finally {
		if (fs.existsSync(configPath)) {
			fs.unlinkSync(configPath);
		}
	}
}

export async function runTests(lambdaName) {
	const config = await createJestConfig(lambdaName);
	await runJest(config);
}