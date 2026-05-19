import fs from 'fs';
import path from 'path';

function getFastLbsConfigPath() {
    return path.join(process.cwd(), 'fastlbs.config.json');
}

export function getRegisteredLambdaNames() {
    const configPath = getFastLbsConfigPath();
    if (!fs.existsSync(configPath)) {
        throw new Error('fastlbs.config.json not found in current directory.');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const lambdas = config?.lambdas;
    if (!lambdas || typeof lambdas !== 'object') {
        return [];
    }

    return Object.keys(lambdas);
}
