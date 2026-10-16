import { getProjectRootOrThrow } from '../../../utils/project_context.js';
import { registerLambdaDoc } from '../../../services/docs/doc_manager.js';

export function createBaseDoc(lambdaName, lambdaPath, method) {
    const projectRoot = getProjectRootOrThrow();
    registerLambdaDoc(projectRoot, lambdaName, lambdaPath, method);
}