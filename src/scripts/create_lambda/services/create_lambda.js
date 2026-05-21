import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidLambdaName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

const createFolderStructure = (lambdaName) => {
    assertValidLambdaName(lambdaName);
    const projectRoot = getProjectRootOrThrow();
    const lambdaDir = path.join(projectRoot, 'lambdas', lambdaName);
    const srcDir = path.join(lambdaDir, 'src');
    const testDir = path.join(lambdaDir, '__tests__');

    assertPathInsideProject(projectRoot, lambdaDir, 'lambda directory');

    fs.mkdirSync(lambdaDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    return { srcDir, testDir };
}

const getProyectName = () => {
    const projectRoot = getProjectRootOrThrow();
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        return config.service || 'my-fastlbs-project';
    }
    return 'my-fastlbs-project';
}

const generateIndexFile = (srcDir, lambdaName) => {
    const projectName = getProyectName();
    const indexContent =
`
import {
    handlerResponse
} from "@${projectName}/common/wrappers/handlerResponse.wrapper";

import { HandlerStandardResponse } from "@${projectName}/common/utils/handlerStandardResponse.util";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

type GreetingData = {
    greeting: string;
};

async function service(
    _event: APIGatewayProxyEventV2,
    _context: Context
): Promise<HandlerStandardResponse<GreetingData>> {
    return new HandlerStandardResponse<GreetingData>(200, {
        message: "Request successful",
        status: "success",
        data: {
            greeting: "Hello, World! from Lambda ${lambdaName}",
        },
    });
}

export const handler = handlerResponse(service);

`
    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent.trimStart());
}

const generateIndexFileTest = (testDir, lambdaName) => {
    const indexTestContent = `
import { handler } from "../src/index";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

describe("${lambdaName} Lambda", () => {
    it("should return a successful greeting response", async () => {
        const mockEvent = {} as any; 
        const mockContext = {} as any; 
        const response = await handler(mockEvent, mockContext);
        if (typeof response === "string") {
            throw new Error("Expected structured API Gateway response");
        }
        const structuredResponse = response as APIGatewayProxyStructuredResultV2;
        expect(structuredResponse.statusCode).toBe(200);
        expect(structuredResponse.body).toBeDefined();
        const responseBody = JSON.parse(structuredResponse.body ?? "{}");
        expect(responseBody).toHaveProperty("message", "Request successful");
        expect(responseBody).toHaveProperty("status", "success");
        expect(responseBody).toHaveProperty("data");
        expect(responseBody.data).toHaveProperty("greeting", "Hello, World! from Lambda ${lambdaName}");
    }
    );
});

`
    fs.writeFileSync(path.join(testDir, 'index.spec.ts'), indexTestContent.trimStart());
}

export const createLambda = (lambdaName) => {
    const { srcDir, testDir } = createFolderStructure(lambdaName);
    generateIndexFile(srcDir, lambdaName);
    generateIndexFileTest(testDir, lambdaName);
};