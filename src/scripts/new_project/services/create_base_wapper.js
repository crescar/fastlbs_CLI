import fs from 'fs';
import path from 'path';
export function createBaseWrapper(projectName) {
    const wrapperContent =
`
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import { HandlerStandardResponse } from "../utils/handlerStandardResponse.util";

export type HandlerCallback<T = unknown> = (
  event: APIGatewayProxyEventV2,
  context: Context
) => Promise<HandlerStandardResponse<T>>;

export type MiddlewareNext<T = unknown> = () => Promise<HandlerStandardResponse<T>>;

export type HandlerMiddleware<T = unknown> = (
  event: APIGatewayProxyEventV2,
  context: Context,
  next: MiddlewareNext<T>
) => Promise<HandlerStandardResponse<T>>;

export function handlerResponse<T = unknown>(
  ...args: [...middlewares: HandlerMiddleware<T>[], callback: HandlerCallback<T>]
) {
  const callback = args[args.length - 1] as HandlerCallback<T>;
  const middlewares = args.slice(0, -1) as HandlerMiddleware<T>[];

  return async (
    event: APIGatewayProxyEventV2,
    context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      let currentIndex = -1;

      const dispatch = async (index: number): Promise<HandlerStandardResponse<T>> => {
        if (index <= currentIndex) {
          throw new HandlerErrorResponse(500, "next() called multiple times");
        }

        currentIndex = index;
        const middleware = middlewares[index];

        if (middleware) {
          return middleware(event, context, () => dispatch(index + 1));
        }

        return callback(event, context);
      };

      const result = await dispatch(0);
      return {
        statusCode: result.statusCode,
        body: JSON.stringify(result.responseBody),
      };
    } catch (error) {
      if (error instanceof HandlerErrorResponse) {
        return {
          statusCode: error.statusCode,
          body: JSON.stringify({
            message: error.message,
            error: error.error,
          }),
        };
      }
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "An unexpected error occurred",
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  };
}
`
    const filePath = path.join(process.cwd(), `${projectName}/libs/common/wrappers/handlerResponse.wrapper.ts`);
    fs.writeFileSync(filePath, wrapperContent);
}