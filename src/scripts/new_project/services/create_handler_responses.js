import fs from 'fs';
import path from 'path';

function createHandlerErrorResponse(projectName) {
    const content =
`/* @fastlbs-i18n v1 */
export interface HandlerErrorI18nOptions {
  messageKey?: string;
  params?: Record<string, unknown>;
}

export class HandlerErrorResponse extends Error {
  public statusCode: number;
  public message: string;
  public error: any;
  public messageKey?: string;
  public messageParams?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    error?: any,
    i18nOptions?: HandlerErrorI18nOptions
  ) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
    this.messageKey = i18nOptions?.messageKey;
    this.messageParams = i18nOptions?.params;
  }

  /**
   * Creates an error response backed by an i18n translation key and optional interpolation parameters.
   */
  public static i18n(
    statusCode: number,
    messageKey: string,
    params?: Record<string, unknown>,
    error?: any
  ): HandlerErrorResponse {
    return new HandlerErrorResponse(statusCode, messageKey, error, {
      messageKey,
      params,
    });
  }
}
`;
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/utils/handlerErrorResponse.util.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content.trimStart());
}

function createHandlerStandardResponse(projectName) {
    const content =
`/* @fastlbs-i18n v1 */
type responseBody<T = any> = {
    message: string,
    status: string,
    data?: T
}

export class HandlerStandardResponse<T = any> {
    public statusCode: number
    public responseBody: responseBody<T>
    public headers?: Record<string, string>
    constructor(
        statusCode: number,
        responseBody: responseBody<T>,
        headers?: Record<string, string>
    ) {
        this.statusCode = statusCode
        this.responseBody = responseBody
        this.headers = headers
    }
}
`;
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/utils/handlerStandardResponse.util.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content.trimStart());
}

export function createHandlerResponses(projectName) {
    createHandlerErrorResponse(projectName);
    createHandlerStandardResponse(projectName);
}
