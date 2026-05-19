import fs from 'fs';
import path from 'path';

export function folderStructure(projectName) {
    const folders = [
        `${projectName}/lambdas/__doc__/src/documents/lambdas`,
        `${projectName}/libs/common/middlewares`,
        `${projectName}/libs/common/utils`,
        `${projectName}/libs/common/wrappers`,
        `${projectName}/serverlessConfig/functions`,
    ]
    folders.forEach(folder => {
        const folderPath = path.join(process.cwd(), folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
    });
}