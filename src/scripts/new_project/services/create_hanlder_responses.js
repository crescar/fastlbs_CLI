import fs from 'fs';
import path from 'path';

function createHanlderErrorResponse(projectName){
const content =
`
export class HandlerErrorResponse extends Error {
  public statusCode: number
  public message: string
  public error: any
  constructor(statusCode: number, message: string, error?: any) {
    super(message)
    this.statusCode = statusCode
    this.message = message
    this.error = error
  }
}
`
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/utils/handlerErrorResponse.util.ts`);
    fs.writeFileSync(filePath, content);
}

function createHandlerStandardResponse(projectName){
const content =
`
type responseBody<T = any> = {
    message: string,
    status: string,
    data?: T
}

export class HandlerStandardResponse<T = any> {
    public statusCode: number
    public responseBody: responseBody<T>
    constructor(statusCode: number, responseBody: responseBody<T>) {
        this.statusCode = statusCode
        this.responseBody = responseBody
    }
}
`
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/utils/handlerStandardResponse.util.ts`);
    fs.writeFileSync(filePath, content);
}

export function createHandlerResponses(projectName) {
    createHanlderErrorResponse(projectName);
    createHandlerStandardResponse(projectName);
}