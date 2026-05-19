import fs from 'fs';
import path from 'path';
export function existLambda(lambdaName) {
    const filePath = path.join(process.cwd(), 'fastlbs.config.json');
    if (!fs.existsSync(filePath)) {
        console.error('fastlbs.config.json not found. Please make sure you are in the root directory of a FastLBS project.');
        return {
            fileNotFound: true,
            exists: false
        }
    }
    const configContent = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(configContent);
    const exists = !!config.lambdas[lambdaName];
    return {
        fileNotFound: false,
        exists,
    };
}