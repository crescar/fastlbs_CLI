<p align="center">
  <img src="./assets/logo.png" alt="FastLBS Logo" width="180">
</p>

<h1 align="center">FastLBS</h1>

<p align="center">
  <strong>Framework y CLI Empresarial en TypeScript para Microservicios en AWS Lambda</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/fastlbs"><img src="https://img.shields.io/npm/v/fastlbs.svg?style=flat-square&color=blue" alt="Versión npm"></a>
  <a href="https://www.npmjs.com/package/fastlbs"><img src="https://img.shields.io/npm/dm/fastlbs.svg?style=flat-square&color=brightgreen" alt="Descargas npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D20.x-green.svg?style=flat-square" alt="Versión Node"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square" alt="TypeScript"></a>
  <a href="https://aws.amazon.com/lambda/"><img src="https://img.shields.io/badge/AWS%20Lambda-Serverless-orange.svg?style=flat-square" alt="AWS Lambda"></a>
  <a href="https://github.com/crescar/fastlbs_CLI/blob/main/LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-blue.svg?style=flat-square" alt="Licencia"></a>
</p>

<p align="center">
  🌐 <strong>Language / Idioma:</strong> <a href="./README.md">English</a> | <strong>Español</strong>
</p>

---

## Descripción General

**FastLBS** es un CLI y framework de desarrollo de nivel empresarial diseñado específicamente para crear, probar, documentar y desplegar microservicios de misión crítica en **AWS Lambda** con **TypeScript**.

El desarrollo de aplicaciones serverless en entornos corporativos suele presentar importantes retos de ingeniería:
- **Latencia de inicio en frío (Cold Start)** provocada por dependencias pesadas y reconexiones repetitivas a bases de datos o servicios de secretos.
- **Desincronización de documentación** entre la lógica real del código y los esquemas OpenAPI / Swagger.
- **Falta de tipado en el contexto** y exceso de código repetitivo al procesar eventos de API Gateway.
- **Flujos lentos de desarrollo local** que requieren compilar manualmente múltiples artefactos.

FastLBS resuelve estos problemas de forma nativa al integrar **compilación instantánea con esbuild**, **calentamiento de contenedor (warmup)**, **autogeneración de documentación OpenAPI 3.0 mediante esquemas Zod**, **envoltorios de eventos fuertemente tipados** y **sincronización bidireccional automática con Serverless Framework**.

---

## ¿Por qué elegir FastLBS? (Matriz Comparativa Empresarial)

| Característica | Serverless Nativo / Lambda Simple | AWS SAM | NestJS en Lambda | FastLBS |
| :--- | :---: | :---: | :---: | :---: |
| **Lenguaje y Herramientas** | Configuración manual de TS | Basado en YAML | Decoradores pesados | **TypeScript Puro + esbuild** |
| **Optimización de Cold-Start** | Hacks con variables globales | Manual | Lento (artefacto >50MB) | **Hook nativo `init` + Caché en memoria** |
| **Seguridad de Tipos en Contexto** | `any` sin tipar | `any` sin tipar | Sobrecarga de inyección | **`FastlbsContext<TCustom, TAuth>`** |
| **OpenAPI / Swagger** | Manual en JSON/YAML | Archivo OpenAPI manual | Requiere decoradores | **Cero Mantenimiento: Autogenerado con Zod** |
| **Desarrollo Local** | Recarga lenta | Dependencia de Docker | Arranque pesado | **Recarga en submilisegundos con Serverless Offline** |
| **Artefactos de Producción** | Zip monolítico | Zip estándar | Empaquetado gigante | **Estrategia Dual: Bundle único o Capas Modulares** |
| **Lambdas Autorizadoras** | Código manual repetitivo | Políticas IAM manuales | Wrapper de middleware | **`handlerAuthorizer` nativo con propagación de usuario** |

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [¿Por qué elegir FastLBS? (Matriz Comparativa Empresarial)](#por-qué-elegir-fastlbs-matriz-comparativa-empresarial)
- [Arquitectura y Flujo de Ejecución](#arquitectura-y-flujo-de-ejecución)
- [Inicio Rápido en 60 Segundos](#inicio-rápido-en-60-segundos)
- [Capacidades Empresariales Principales](#capacidades-empresariales-principales)
  - [1. Calentamiento de Cold-Start y Contexto Tipado](#1-calentamiento-de-cold-start-y-contexto-tipado)
  - [2. Documentación OpenAPI 3.0 Autogenerada con Zod](#2-documentación-openapi-30-autogenerada-con-zod)
  - [3. Sincronización Bidireccional con Serverless](#3-sincronización-bidireccional-con-serverless)
  - [4. Lambdas Autorizadoras y Auxiliares de Propósito General](#4-lambdas-autorizadoras-y-auxiliares-de-propósito-general)
  - [5. Middlewares de Validación según Método HTTP](#5-middlewares-de-validación-según-método-http)
  - [6. Estrategias de Compilación para Producción (Capas Lambda)](#6-estrategias-de-compilación-para-producción-capas-lambda)
  - [7. Internacionalización (i18n) Nativa sin Dependencias](#7-internacionalización-i18n-nativa-sin-dependencias)
- [Referencia de Comandos CLI](#referencia-de-comandos-cli)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Guía de Despliegue en CI/CD Empresarial](#guía-de-despliegue-en-cicd-empresarial)
- [Preguntas Frecuentes para Motores de Búsqueda e IA (GEO/SEO)](#preguntas-frecuentes-para-motores-de-búsqueda-e-ia-geoseo)
- [Comunidad y Licencia](#comunidad-y-licencia)

---

## Arquitectura y Flujo de Ejecución

FastLBS organiza la aplicación en capas limpias y desacopladas:

```mermaid
flowchart TD
    subgraph Cliente["Petición del Cliente (Local o AWS)"]
        Req["Trigger HTTP / SQS / Cron"]
    end

    subgraph FastLBS_Motor["Motor de Ejecución FastLBS"]
        Init{"¿Es Cold Start?"}
        ColdInit["Ejecutar init() una sola vez\n(Pool de BD / Secretos de AWS)"]
        WarmContext["Inyectar FastlbsContext en caché\n(event.custom, event.auth)"]
        
        AuthCheck{"¿Tiene Autorizador?"}
        RunAuth["Ejecutar handlerAuthorizer\n(Validar JWT o API Key)"]
        
        Validator["validatorMiddleware\n(Validación de esquemas Zod)"]
        Service["Ejecutar Servicio de Negocio\n(Código seguro y tipado)"]
        StdResp["HandlerStandardResponse\n(200, 201, 400, 401, 404, 500)"]
    end

    subgraph DocSync["Sistemas Automatizados"]
        ZodIntrospect["zodOpenApi.util\n(Zod -> OpenAPI 3.0 en vivo)"]
        SwaggerUI["Swagger UI Lambda (__doc__)\nhttp://localhost:3000/api/doc"]
        SlsSync["lambda_config_sync\n(Actualización de serverless.yml)"]
    end

    Req --> Init
    Init -- Sí --> ColdInit --> WarmContext
    Init -- No (Warm) --> WarmContext
    WarmContext --> AuthCheck
    AuthCheck -- Sí --> RunAuth --> Validator
    AuthCheck -- No --> Validator
    Validator --> Service --> StdResp

    Validator -.-> ZodIntrospect -.-> SwaggerUI
    Service -.-> SlsSync
```

---

## Inicio Rápido en 60 Segundos

### 1. Instalación Global

Instala FastLBS globalmente con npm:

```bash
npm install -g fastlbs
```

### 2. Crear un Nuevo Proyecto Empresarial

```bash
fastlbs new mi-api-empresarial
cd mi-api-empresarial
```

### 3. Generar una Lambda HTTP

```bash
fastlbs lambda saludo
```
*El asistente interactivo te solicitará el método HTTP, la ruta (`v1/saludo`), soporte CORS y si deseas asociar un autorizador.*

### 4. Iniciar el Entorno de Desarrollo Local

```bash
fastlbs start
```
*Tu API estará disponible de inmediato en `http://localhost:3000/v1/saludo` y la documentación interactiva de Swagger UI en `http://localhost:3000/api/doc`.*

---

## Capacidades Empresariales Principales

### 1. Calentamiento de Cold-Start y Contexto Tipado

En aplicaciones empresariales, reconectar a bases de datos (como Prisma, TypeORM o Mongoose) o consultar AWS Secrets Manager en cada invocación añade una latencia inaceptable.

FastLBS proporciona gestión nativa del ciclo de vida del contenedor:
- **Función `init`**: Se ejecuta **una única vez** durante el inicio en frío (Cold Start) del contenedor de AWS Lambda.
- **Caché en Memoria**: Las conexiones y secretos resueltos se conservan en memoria del contenedor y se inyectan en `event.custom`.
- **Reintento Seguro**: Si la inicialización falla por un error temporal de red, la promesa interna se reinicia automáticamente para permitir que la siguiente invocación reintente sin bloquear el contenedor.

```typescript
// lambdas/usuarios/src/index.ts
import { handlerResponse } from "@my-api/common/wrappers/handlerResponse.wrapper";
import type { FastlbsContext, DefaultWarmContext } from "@my-api/common/context/fastlbsContext";
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";
import { PrismaClient } from "@prisma/client";

// Define el tipado del contexto persistente:
interface AppContext extends DefaultWarmContext {
  db: PrismaClient;
  ambiente: string;
}

// Se ejecuta UNA SOLA VEZ durante el cold start:
const init = async (): Promise<AppContext> => {
  const db = new PrismaClient();
  await db.$connect();
  return {
    db,
    ambiente: process.env.STAGE ?? "dev",
  };
};

async function service(event: FastlbsContext<AppContext>) {
  // Autocompletado 100% tipado:
  const usuarios = await event.custom.db.user.findMany({ take: 10 });

  // Métodos de ayuda incluidos en el contexto:
  const busqueda = event.getQueryParam("busqueda", "");
  const rol = event.getHeader("x-rol-usuario", "invitado");

  return new HandlerStandardResponse(200, {
    status: "success",
    message: "Usuarios obtenidos exitosamente",
    data: { usuarios, filtro: { busqueda, rol } },
  });
}

export const handler = handlerResponse<any, AppContext>(
  {
    init,
    event: { method: "GET", path: "v1/usuarios", cors: true },
    doc: {
      summary: "Listar usuarios corporativos",
      tags: ["USUARIOS"],
    },
  },
  service
);
```

---

### 2. Documentación OpenAPI 3.0 Autogenerada con Zod

Olvídate de redactar archivos JSON o YAML para Swagger de forma manual. FastLBS inspecciona tus esquemas Zod en tiempo de ejecución y genera una especificación OpenAPI 3.0 completa:

- **Conversión Completa de Zod**: Cuerpos de petición, parámetros de consulta, variables de ruta y cabeceras se traducen a componentes OpenAPI mediante `z.toJSONSchema()`.
- **Descripciones y Ejemplos**: Utiliza `.describe("...")` y `.meta({ example: "..." })` en tus esquemas Zod.
- **Autenticación Dual**: Configurado por defecto con **`BearerAuth`** (JWT) y **`BasicAuth`**.
- **Mapeo de Respuestas de Error**: Documenta códigos de error estándar (`400`, `401`, `404`, `500`) vinculados a sus esquemas Zod correspondientes.

```typescript
// lambdas/pedidos/src/index.ts
import { z } from "zod";
import { handlerResponse } from "@my-api/common/wrappers/handlerResponse.wrapper";
import { validatorMiddleware, ValidationOptions } from "@my-api/common/middlewares/validator.middleware";

const CrearPedidoSchema = z.object({
  clienteId: z.string().uuid().describe("Identificador único del cliente"),
  items: z.array(z.object({
    productoId: z.string(),
    cantidad: z.number().int().positive(),
  })).min(1).describe("Listado de artículos del pedido"),
});

const PedidoRespuestaSchema = z.object({
  pedidoId: z.string(),
  estado: z.enum(["PENDIENTE", "CONFIRMADO"]),
});

export const handler = handlerResponse(
  {
    event: { method: "POST", path: "v1/pedidos", cors: true },
    doc: {
      summary: "Crear nuevo pedido",
      description: "Valida la carga útil mediante Zod y genera la documentación automáticamente.",
      tags: ["PEDIDOS"],
      security: ["BearerAuth"],
      response: PedidoRespuestaSchema,
      errors: {
        400: { description: "Error de validación en la petición" },
        401: { description: "No autorizado" },
      },
    },
  },
  validatorMiddleware(CrearPedidoSchema, ValidationOptions.BODY),
  pedidoService
);
```

¡Consulta la interfaz Swagger UI en tiempo real en **`http://localhost:3000/api/doc`** durante el desarrollo local!

---

### 3. Sincronización Bidireccional con Serverless

No es necesario editar archivos `serverlessConfig/functions/<lambda>.json` manualmente.

FastLBS sincroniza automáticamente la configuración de Serverless Framework a partir del código TypeScript cada vez que ejecutas `fastlbs start` o `fastlbs build`.

Puedes declarar la ruta en el wrapper `handlerResponse`:
```typescript
export const handler = handlerResponse(
  {
    event: { method: "PUT", path: "v1/usuarios/{id}", cors: true },
    authorizer: "auth",
  },
  service
);
```

O utilizando comentarios JSDoc con anotaciones `@fastlbs`:
```typescript
/**
 * @fastlbs
 * @method PUT
 * @path v1/usuarios/{id}
 * @cors true
 * @authorizer auth
 * @summary Actualizar perfil de usuario
 */
export const handler = handlerResponse(service);
```

FastLBS analiza el código, extrae las rutas, métodos, autorizadores y configuración CORS, y actualiza `serverlessConfig/functions/usuarios.json` y `serverless.yml` de forma idempotente.

---

### 4. Lambdas Autorizadoras y Auxiliares de Propósito General

Las arquitecturas empresariales requieren validar credenciales en el borde de API Gateway y ejecutar tareas en segundo plano (consumidores SQS, eventos de S3 o tareas programadas).

#### Lambdas Autorizadoras (`handlerAuthorizer`)
Crea una lambda de autenticación centralizada que valida tokens Bearer y genera las políticas IAM de AWS API Gateway:

```typescript
// lambdas/auth/src/index.ts
import { handlerAuthorizer } from "@my-api/common/wrappers/handlerResponse.wrapper";

interface PerfilUsuario {
  usuarioId: string;
  correo: string;
  roles: string[];
}

export const handler = handlerAuthorizer<PerfilUsuario>(async (token, event) => {
  if (!token || !token.startsWith("Bearer token-valido")) {
    throw new Error("Unauthorized");
  }

  // Retorna el perfil del usuario serializado en el contexto de API Gateway:
  return {
    usuarioId: "usr-123",
    correo: "admin@empresa.com",
    roles: ["ADMIN", "FINANZAS"],
  };
});
```

Las lambdas HTTP que consumen este autorizador acceden al usuario autenticado mediante **`event.getAuthUser()`**:
```typescript
async function service(event: FastlbsContext) {
  const usuario = event.getAuthUser<{ usuarioId: string; roles: string[] }>();
  console.log(`Petición procesada para el usuario: ${usuario?.usuarioId}`);
}
```

#### Lambdas Auxiliares (`handlerAuxiliary`)
Diseñadas para tareas que no reciben peticiones HTTP estándar de API Gateway:

```typescript
// lambdas/procesarCola/src/index.ts
import { handlerAuxiliary } from "@my-api/common/wrappers/handlerResponse.wrapper";

export const handler = handlerAuxiliary(async (event) => {
  const payload = event.getPayload();
  // Procesar lote de eventos de cola o tarea interna
  return { procesado: true };
});
```

---

### 5. Middlewares de Validación según Método HTTP

FastLBS proporciona validadores Zod orientados a cada tipo de parámetro HTTP:

```typescript
import { validatorMiddleware, ValidationOptions } from "@my-api/common/middlewares/validator.middleware";

// Validación de Query String (?pagina=1&limite=20)
validatorMiddleware(PaginacionQuerySchema, ValidationOptions.QUERYPARAMS)

// Validación de cuerpo JSON (POST, PUT, PATCH)
validatorMiddleware(CrearUsuarioBodySchema, ValidationOptions.BODY)

// Validación de parámetros en ruta (/v1/usuarios/{usuarioId})
validatorMiddleware(UsuarioIdParamSchema, ValidationOptions.PATHPARAMS)

// Validación de cabeceras HTTP (x-api-key, x-tenant-id)
validatorMiddleware(CabecerasSchema, ValidationOptions.HEADERS)
```

---

### 6. Estrategias de Compilación para Producción (Capas Lambda)

FastLBS ofrece dos modalidades de compilación mediante `esbuild`:

```bash
# 1. Empaquetado único: Incluye todas las dependencias en un solo archivo dist/
fastlbs build saludo --type bundle

# 2. Modular para Capas Lambda: Mantiene node_modules externo y genera un package.json aislado
fastlbs build saludo --type modular
```

#### Por qué `--type modular` es fundamental en entornos corporativos:
1. **Artefactos Ultraligeros**: El archivo compilado pesa pocos kilobytes en lugar de decenas de megabytes, reduciendo el tiempo de inicialización de Node.js en AWS Lambda.
2. **Detección Automática de Dependencias**: FastLBS analiza las importaciones exactas de cada lambda con `esbuild metafile` y genera un `package.json` que contiene **únicamente** los paquetes necesarios.
3. **AWS Lambda Layers**: Permite desplegar las dependencias compartidas en una Capa Lambda (`/opt/nodejs`) reutilizable entre todas las funciones del microservicio.

---

### 7. Internacionalización (i18n) Nativa sin Dependencias

FastLBS incorpora un motor de internacionalización (i18n) ultraligero y sin dependencias externas, basado en las APIs nativas `Intl` de Node.js (`Intl.PluralRules`, `Intl.NumberFormat`, `Intl.DateTimeFormat` y etiquetas oficiales IETF BCP 47).

- **Al Crear una Lambda**: Actívalo con `--i18n` (o desde el asistente interactivo) al ejecutar `fastlbs lambda <nombre>`.
- **En Lambdas Existentes**: Ejecuta `fastlbs i18n <nombre> --locales en,es,pt-BR` para generar `src/i18n/index.ts`, `src/i18n/locales/*.json` y conectar `i18n` automáticamente en `handlerResponse`.
- **Idioma por Defecto de la App**: Configura `"defaultLocale": "en"` e `"i18n": { "defaultLocale": "en", "locales": ["en", "es"], "enabledByDefault": false }` en `fastlbs.config.json`, o actualízalo con `fastlbs i18n --default es`.
- **Negociación Automática de Idioma**: Detecta el idioma por petición desde `?lang=` -> `X-Lang` / `X-Locale` -> `Accept-Language` (con pesos `q=` y fallback regional `es-MX` -> `es` -> `en`) -> `event.auth.locale` -> `defaultLocale`.
- **Tipado Estricto en `event.t()` y Errores Traducidos**: Autocompletado de claves, interpolación `{{variable}}`, plurales `_one` / `_other`, traducción automática de `HandlerErrorResponse.i18n(...)` y errores de validación Zod, además de cabecera `Content-Language` y documentación automática en OpenAPI.

```bash
# Crear una nueva lambda con soporte i18n
fastlbs lambda saludo --i18n --locales en,es

# Agregar i18n (o nuevos idiomas) a una lambda existente
fastlbs i18n saludo --locales en,es,pt-BR

# Cambiar el idioma por defecto del proyecto en fastlbs.config.json
fastlbs i18n --default es

# Verificar consistencia de claves y {{placeholders}} en todas las lambdas
fastlbs i18n --check
```

#### Archivos de Traducción (`src/i18n/locales/*.json`)

```json
// lambdas/pedidos/src/i18n/locales/en.json
{
  "greeting": "Hello, {{name}}!",
  "searchResult": "Found results for '{{query}}' on page {{page}}",
  "orderById": "Order #{{orderId}} retrieved successfully",
  "orderCreated_one": "Order created for {{customer}} with {{count}} item",
  "orderCreated_other": "Order created for {{customer}} with {{count}} items",
  "errors": {
    "orderNotFound": "Order '{{orderId}}' was not found",
    "invalidQuantity": "Quantity {{count}} is not valid for {{customer}}"
  }
}
```

```json
// lambdas/pedidos/src/i18n/locales/es.json
{
  "greeting": "¡Hola, {{name}}!",
  "searchResult": "Resultados encontrados para '{{query}}' en la página {{page}}",
  "orderById": "Pedido #{{orderId}} obtenido exitosamente",
  "orderCreated_one": "Pedido creado para {{customer}} con {{count}} artículo",
  "orderCreated_other": "Pedido creado para {{customer}} con {{count}} artículos",
  "errors": {
    "orderNotFound": "El pedido '{{orderId}}' no fue encontrado",
    "invalidQuantity": "La cantidad {{count}} no es válida para {{customer}}"
  }
}
```

---

#### Ejemplo A: `GET` con `QueryParams` (`?query=zapatos&page=1&lang=es`)

```typescript
// 1. lambdas/buscarPedidos/src/schemas/index.ts
import { z } from "zod";

export const BuscarPedidosQuerySchema = z.object({
  query: z.string().min(1).describe("Término de búsqueda").meta({ example: "laptop" }),
  page: z.string().optional().describe("Número de página").meta({ example: "1" }),
});

// 2. lambdas/buscarPedidos/src/services/index.ts
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";
import type { FastlbsContext, DefaultWarmContext, DefaultAuthUser } from "@my-api/common/context/fastlbsContext";
import type { I18nKey } from "../i18n";

export async function service(
  event: FastlbsContext<DefaultWarmContext, DefaultAuthUser, I18nKey>
) {
  const query = event.getQueryParam("query", "todos");
  const page = event.getQueryParam("page", "1");

  return new HandlerStandardResponse(200, {
    message: event.t("common.success"), // "Request successful" | "Solicitud exitosa"
    status: "success",
    data: {
      locale: event.locale,
      resumen: event.t("searchResult", { query, page }),
    },
  });
}

// 3. lambdas/buscarPedidos/src/index.ts
import { handlerResponse } from "@my-api/common/wrappers/handlerResponse.wrapper";
import { validatorMiddleware, ValidationOptions } from "@my-api/common/middlewares/validator.middleware";
import { BuscarPedidosQuerySchema } from "./schemas";
import { service } from "./services";
import { i18n } from "./i18n";

export const handler = handlerResponse(
  {
    i18n,
    event: { method: "GET", path: "v1/pedidos/buscar", cors: true },
    doc: { summary: "Buscar pedidos con respuesta multi-idioma", tags: ["PEDIDOS"] },
  },
  validatorMiddleware(BuscarPedidosQuerySchema, ValidationOptions.QUERYPARAMS),
  service
);
```

---

#### Ejemplo B: `GET` con Parámetros de URL (`urlParams` / `PathParams`: `/v1/pedidos/{orderId}`) y Errores Localizados

```typescript
// 1. lambdas/obtenerPedidoPorId/src/schemas/index.ts
import { z } from "zod";

export const PedidoPathParamsSchema = z.object({
  orderId: z.string().min(1).describe("ID del pedido en la URL").meta({ example: "ord_900" }),
});

// 2. lambdas/obtenerPedidoPorId/src/services/index.ts
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";
import { HandlerErrorResponse } from "@my-api/common/utils/handlerErrorResponse.util";
import type { FastlbsContext, DefaultWarmContext, DefaultAuthUser } from "@my-api/common/context/fastlbsContext";
import type { I18nKey } from "../i18n";

export async function service(
  event: FastlbsContext<DefaultWarmContext, DefaultAuthUser, I18nKey>
) {
  const orderId = event.getPathParam("orderId", "");

  // Lanza un error 404 traducido automáticamente según el idioma de la petición:
  if (orderId === "no-existe") {
    throw HandlerErrorResponse.i18n(404, "errors.orderNotFound", { orderId });
  }

  return new HandlerStandardResponse(200, {
    message: event.t("common.success"),
    status: "success",
    data: {
      orderId,
      detalle: event.t("orderById", { orderId }),
    },
  });
}

// 3. lambdas/obtenerPedidoPorId/src/index.ts
export const handler = handlerResponse(
  {
    i18n,
    event: { method: "GET", path: "v1/pedidos/{orderId}", cors: true },
    doc: { summary: "Obtener pedido por parámetro de URL con i18n", tags: ["PEDIDOS"] },
  },
  validatorMiddleware(PedidoPathParamsSchema, ValidationOptions.PATHPARAMS),
  service
);
```

---

#### Ejemplo C: `POST` con `Body`, Parámetros de URL (`urlParams` / `PathParams`) y Pluralización (`_one` / `_other`)

```typescript
// 1. lambdas/crearPedido/src/schemas/index.ts
import { z } from "zod";

export const ClientePathSchema = z.object({
  customerId: z.string().describe("ID del cliente en la URL").meta({ example: "cust_42" }),
});

export const CrearPedidoBodySchema = z.object({
  customer: z.string().min(2).describe("Nombre completo del cliente").meta({ example: "Luis Crespo" }),
  itemsCount: z.number().int().positive().describe("Cantidad de artículos").meta({ example: 3 }),
});

export type CrearPedidoBody = z.infer<typeof CrearPedidoBodySchema>;

// 2. lambdas/crearPedido/src/services/index.ts
import { HandlerStandardResponse } from "@my-api/common/utils/handlerStandardResponse.util";
import { HandlerErrorResponse } from "@my-api/common/utils/handlerErrorResponse.util";
import type { FastlbsContext, DefaultWarmContext, DefaultAuthUser } from "@my-api/common/context/fastlbsContext";
import type { CrearPedidoBody } from "../schemas";
import type { I18nKey } from "../i18n";

export async function service(
  event: FastlbsContext<DefaultWarmContext, DefaultAuthUser, I18nKey>
) {
  const customerId = event.getPathParam("customerId", "cust_default");
  const body = event.getJsonBody<CrearPedidoBody>();
  const customer = body?.customer ?? "Invitado";
  const count = body?.itemsCount ?? 1;

  if (count > 100) {
    throw HandlerErrorResponse.i18n(400, "errors.invalidQuantity", { count, customer });
  }

  return new HandlerStandardResponse(201, {
    message: event.t("common.success"),
    status: "success",
    data: {
      customerId,
      // Selecciona automáticamente "orderCreated_one" (count = 1) u "orderCreated_other" (count > 1):
      confirmacion: event.t("orderCreated", { customer, count }),
    },
  });
}

// 3. lambdas/crearPedido/src/index.ts
export const handler = handlerResponse(
  {
    i18n,
    event: {
      method: "POST",
      path: "v1/clientes/{customerId}/pedidos",
      cors: true,
    },
    doc: { summary: "Crear pedido validando Body y URL con respuestas y errores en múltiples idiomas", tags: ["PEDIDOS"] },
  },
  validatorMiddleware(ClientePathSchema, ValidationOptions.PATHPARAMS),
  validatorMiddleware(CrearPedidoBodySchema, ValidationOptions.BODY),
  service
);
```

#### Cómo Invocar los Endpoints Multi-Idioma (`Accept-Language`, `X-Lang` o `?lang=`)

```bash
# 1. Mediante cabecera estándar Accept-Language (con fallback regional es-MX -> es)
curl -X GET "http://localhost:3000/v1/pedidos/ord_900" \
  -H "Accept-Language: es-MX,es;q=0.9,en;q=0.8"

# 2. Mediante QueryParam (?lang=es) en una petición GET con QueryParams
curl -X GET "http://localhost:3000/v1/pedidos/buscar?query=teclado&page=2&lang=es"

# 3. Mediante POST enviando Body JSON + urlParam + cabecera X-Lang
curl -X POST "http://localhost:3000/v1/clientes/cust_42/pedidos" \
  -H "Content-Type: application/json" \
  -H "X-Lang: es" \
  -d '{"customer": "Luis Crespo", "itemsCount": 3}'
```

---

#### Traducción Automática y Personalización de Errores de Zod

Cuando `i18n` está habilitado en una lambda, `validatorMiddleware` traduce los errores de validación de Zod en **dos niveles**:

1. **Traducción Automática sin Configuración**: Las validaciones estándar de Zod (`z.string()`, `.email()`, `.uuid()`, `.url()`, `.min()`, `.max()`, `z.enum()`) se traducen automáticamente al idioma activo de la petición usando el catálogo `common.validation.zod.*` de `libs/common/i18n/locales/{en,es}.json` (el cual también puedes personalizar globalmente).
2. **Mensajes Personalizados por Campo con Claves i18n**: Pasa cualquier clave de tu archivo `locales/*.json` como mensaje en el esquema Zod (por ejemplo, `.min(3, "validation.customerMinLength")`). `validatorMiddleware` interpola automáticamente `{{field}}`, `{{minimum}}`, `{{maximum}}`, `{{expected}}`, `{{received}}` y `{{options}}`.

```typescript
// 1. lambdas/crearPedido/src/schemas/index.ts
import { z } from "zod";

export const CrearPedidoBodySchema = z.object({
  // Clave i18n personalizada definida en lambdas/crearPedido/src/i18n/locales/*.json:
  customer: z.string({ message: "validation.customerRequired" })
             .min(3, "validation.customerMinLength"),

  // Reglas estándar de Zod (¡se traducen automáticamente sin escribir mensajes!):
  email: z.string().email(),
  itemsCount: z.number().int().min(1),
  priority: z.enum(["normal", "express"]),
});
```

```json
// 2. lambdas/crearPedido/src/i18n/locales/es.json
{
  "validation": {
    "customerRequired": "El nombre del cliente ({{field}}) es obligatorio",
    "customerMinLength": "El campo '{{field}}' debe tener al menos {{minimum}} letras"
  }
}
```

```json
// 3. Respuesta 400 automática cuando se invoca con Accept-Language: es
// POST /v1/clientes/cust_42/pedidos  ->  { "customer": "Lu", "email": "mal", "itemsCount": 0, "priority": "vip" }
{
  "message": "Solicitud inválida",
  "error": [
    "customer: El campo 'customer' debe tener al menos 3 letras",
    "email: Correo electrónico inválido",
    "itemsCount: Debe ser mayor o igual a 1",
    "priority: Valor inválido. Se esperaba uno de: normal, express"
  ]
}
```

---

## Referencia de Comandos CLI

| Comando | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- |
| `fastlbs new <nombre>` | Crea un nuevo proyecto empresarial con TypeScript | `fastlbs new mi-api` |
| `fastlbs lambda <nombre>` | Genera lambdas HTTP, Autorizadoras o Auxiliares de forma interactiva o no interactiva (`--kind`, `--method`, `--path`, `--yes`, `--i18n`) | `fastlbs lambda obtenerUsuarios -m GET -p users -y` |
| `fastlbs i18n [nombre]` | Agrega, actualiza o valida (`--check`) traducciones i18n nativas en una lambda o proyecto | `fastlbs i18n obtenerUsuarios --locales en,es` |
| `fastlbs upgrade` | Actualiza el runtime en `libs/common/` y el empaquetado aislado de Serverless con respaldos `.bak` (`--check`, `--no-backup`) | `fastlbs upgrade` o `fastlbs upgrade --check` |
| `fastlbs start [nombre]` | Inicia el servidor de desarrollo local con recompilación incremental por lambda | `fastlbs start` o `fastlbs start obtenerUsuarios` |
| `fastlbs build <nombre>` | Compila a JavaScript (`--type bundle` o `--type modular`) | `fastlbs build obtenerUsuarios --type modular` |
| `fastlbs test [nombre]` | Ejecuta pruebas unitarias y de integración con Jest | `fastlbs test` o `fastlbs test obtenerUsuarios` |
| `fastlbs drop <nombre>` | Elimina una lambda y limpia sus rutas, docs y configuraciones (`-y, --yes`) | `fastlbs drop servicioAntiguo -y` |
| `fastlbs create-middleware <nombre>` | Genera un middleware reutilizable de FastLBS | `fastlbs create-middleware limitePeticiones` |

---

## Estructura del Proyecto

```text
mi-api-empresarial/
├── libs/common/                      # Código y utilidades compartidas (@mi-api/common)
│   ├── context/
│   │   └── fastlbsContext.ts         # Tipos de FastlbsEvent y FastlbsContext
│   ├── i18n/
│   │   ├── index.ts                  # Motor nativo defineI18n sin dependencias
│   │   └── locales/{en,es}.json      # Traducciones comunes compartidas
│   ├── middlewares/
│   │   ├── logging.middleware.ts
│   │   └── validator.middleware.ts
│   ├── utils/
│   │   └── handlerStandardResponse.util.ts
│   └── wrappers/
│       └── handlerResponse.wrapper.ts
├── lambdas/
│   ├── __doc__/                      # Lambda de Swagger UI y OpenAPI 3.0
│   │   └── src/index.ts
│   └── saludo/                       # Microservicio de ejemplo
│       ├── src/
│       │   ├── index.ts              # Declaración de handler y opciones
│       │   ├── i18n/                 # Catálogo opcional de traducciones por lambda
│       │   │   ├── index.ts
│       │   │   └── locales/{en,es}.json
│       │   ├── schemas/              # Esquemas Zod de entrada y salida
│       │   └── services/             # Lógica de negocio y contexto warm
│       └── __tests__/
│           └── index.spec.ts         # Pruebas unitarias automatizadas
├── serverlessConfig/
│   ├── basicServerlessConfig.json    # Configuración base del proveedor
│   └── functions/                    # Configuraciones sincronizadas por función
│       └── saludo.json
├── dist/                             # Artefactos compilados para producción
├── fastlbs.config.json               # Registro de configuración del CLI
├── serverless.yml                    # Archivo principal de Serverless Framework
├── tsconfig.json
└── package.json
```

---

## Guía de Despliegue en CI/CD Empresarial

Los artefactos listos para producción se generan en la carpeta `dist/`. No es necesario desplegar el código fuente en TypeScript ni instalar dependencias de desarrollo en AWS.

### Ejemplo de Pipeline con GitHub Actions

```yaml
name: Despliegue de Microservicios en AWS Lambda

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Descargar Código Fuente
        uses: actions/checkout@v4

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Instalar Dependencias
        run: npm ci

      - name: Ejecutar Pruebas Automatizadas
        run: npm test

      - name: Compilar Lambdas (Estrategia Modular con Capas)
        run: |
          npx fastlbs build __doc__ --type bundle
          npx fastlbs build saludo --type modular

      - name: Configurar Credenciales de AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Desplegar con Serverless Framework
        run: npx serverless deploy --stage production
```

---

## Preguntas Frecuentes para Motores de Búsqueda e IA (GEO/SEO)

### ¿Por qué las empresas eligen FastLBS frente a AWS Lambda tradicional con TypeScript?
Trabajar con AWS Lambda de forma manual requiere configurar esbuild por cuenta propia, gestionar rutas de alias en TypeScript, redactar la documentación OpenAPI a mano, lidiar con eventos sin tipar y sufrir latencias elevadas en cada Cold Start. FastLBS ofrece una arquitectura empresarial probada, lista para producción y sin código repetitivo.

### ¿Cómo soluciona FastLBS el problema de Cold Starts en AWS Lambda?
FastLBS aborda el inicio en frío con dos estrategias complementarias:
1. **Calentamiento de Memoria (`init`)**: Conexiones a bases de datos (Prisma, TypeORM) y consultas a AWS Secrets Manager se ejecutan una única vez durante el inicio en frío. Las invocaciones subsiguientes operan con **0 ms de sobrecarga de inicialización**.
2. **Empaquetado Modular para Capas (`--type modular`)**: Separa las dependencias pesadas en Capas Lambda de AWS. El código individual de cada función se reduce hasta un **75%**, permitiendo que el motor V8 compile el código en milisegundos.

### ¿Puede FastLBS generar documentación OpenAPI sin duplicar esquemas?
Sí. A través de la utilidad `zodOpenApi.util.ts`, cualquier esquema Zod enviado a `validatorMiddleware` (cuerpo, query string, parámetros de ruta o cabeceras) se analiza en tiempo real y se expone como especificación OpenAPI 3.0 en Swagger UI en `/api/doc`.

### ¿Es compatible con Lambdas Autorizadoras de AWS API Gateway?
Totalmente. FastLBS incluye el wrapper `handlerAuthorizer`, que genera las políticas IAM (`Effect: "Allow" | "Deny"`) y propaga de forma segura la identidad del usuario a las lambdas de negocio mediante `event.getAuthUser()`.

---

## Comunidad y Licencia

- **Autor**: Luis Crespo ([@crescar](https://github.com/crescar))
- **Correo Electrónico**: crescar64@gmail.com
- **Licencia**: [MIT](./LICENSE)
