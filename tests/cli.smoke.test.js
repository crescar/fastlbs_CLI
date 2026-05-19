import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'bin', 'fastlbs.js');

function runCli(args) {
    return spawnSync(process.execPath, [cliEntry, ...args], {
        cwd: repoRoot,
        encoding: 'utf-8',
    });
}

test('CLI prints version', () => {
    const result = runCli(['--version']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\d+\.\d+\.\d+/);
});

test('CLI prints help with registered commands', () => {
    const result = runCli(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /new/);
    assert.match(result.stdout, /lambda/);
    assert.match(result.stdout, /build/);
    assert.match(result.stdout, /start/);
    assert.match(result.stdout, /test/);
    assert.match(result.stdout, /drop/);
});
