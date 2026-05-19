import fs from 'fs';
import path from 'path';
export function updateFastLbsConfigJson(lambdaName) {
    const filePath = path.join(process.cwd(), 'fastlbs.config.json');
    if (fs.existsSync(filePath)) {
        const configContent = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(configContent);
        config.lambdas[lambdaName] = {
            "directory": `lambdas/${lambdaName}`,
        };
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }
}