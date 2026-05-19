import fs from 'fs';
import path from 'path';

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lambda API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/api/doc/json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`;

function createIndexDoc(projectName) {
    const content =
`
import { getAbsoluteFSPath } from "swagger-ui-dist";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";

import doc from "./documents";

export async function handlerSwaggerStatic(_event: APIGatewayProxyEventV2, _context: Context): Promise<APIGatewayProxyResultV2> {
  return {
    statusCode: 200,
    body: getAbsoluteFSPath(),
  };
}

export async function handlerSwaggerJson(_event: APIGatewayProxyEventV2, _context: Context): Promise<APIGatewayProxyResultV2> {
  return {
    statusCode: 200,
    body: JSON.stringify(doc),
  };
}

const html = ${JSON.stringify(html)};

export async function handlerSwaggerUI(_event: APIGatewayProxyEventV2, _context: Context): Promise<APIGatewayProxyResultV2> {
  try {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html",
        "charset": "UTF-8",
      },
      body: html,
    };
  } catch (error) {
    console.error("Error reading file:", error);
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }
}

`
    const filePath = path.join(process.cwd(), `${projectName}/lambdas/__doc__/src/index.ts`);
    fs.writeFileSync(filePath, content);
}

function createDocument(projectName) {
    const content =
`
export default {
    "openapi": "3.0.0",
    "info": {
        "title": "API Documentation",
        "description": "This is the API documentation for our service.",
        "version": "1.0.0"
    },
    "servers": [],
    "paths": {},
    "components": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
            },
        },
    },
    "security": [
        {
            "BearerAuth": [],
        },
    ],
}
`
    const filePath = path.join(process.cwd(), `${projectName}/lambdas/__doc__/src/documents/index.ts`);
    fs.writeFileSync(filePath, content);
}

export function createBaseDoc(projectName) {
    createIndexDoc(projectName);
    createDocument(projectName);
}