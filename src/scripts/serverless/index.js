import fs from 'fs';
import path from 'path';
import { dump } from 'js-yaml';

export function autoGenerateServerless() {
    const baseServerlessPath = path.join(process.cwd(), 'serverlessConfig/basicServerlessConfig.json');
    if (!fs.existsSync(baseServerlessPath)) {
        console.error('Base serverless configuration not found. Please run "fastlbs new <project-name>" to create a new project with the necessary configuration files.');
        return;
    }
    const baseServerlessConfig = JSON.parse(fs.readFileSync(baseServerlessPath, 'utf-8'));

    const functionsDir = path.join(process.cwd(), 'serverlessConfig/functions');
    if (!fs.existsSync(functionsDir)) {
        console.error('Functions directory not found. Please run "fastlbs new <project-name>" to create a new project with the necessary configuration files.');
        return;
    }
    const functionFiles = fs.readdirSync(functionsDir).filter((file) => file.endsWith('.json'));

    functionFiles.forEach((file) => {
        const functionConfigPath = path.join(functionsDir, file);
        const functionConfig = JSON.parse(fs.readFileSync(functionConfigPath, 'utf-8'));
        const functionName = path.basename(file, '.json');
        baseServerlessConfig.functions[functionName] = functionConfig[functionName] || functionConfig;
    });

    const yamlStr = dump(baseServerlessConfig);
    const serverlessPath = path.join(process.cwd(), 'serverless.yml');

    if (fs.existsSync(serverlessPath)) {
        fs.unlinkSync(serverlessPath);
    }

    fs.writeFileSync(serverlessPath, yamlStr, 'utf-8');
}