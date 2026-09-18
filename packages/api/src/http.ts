import type { APIGatewayProxyResultV2 } from "aws-lambda";

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  // The snippet is served from a different origin than the API on every
  // customer site, so every response is cross-origin by construction.
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { ...BASE_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

export const ok = (body: unknown, headers?: Record<string, string>) =>
  json(200, body, headers);

export const badRequest = (message: string, detail?: unknown) =>
  json(400, { error: message, detail });

export const serverError = (message: string, detail?: unknown) =>
  json(500, { error: message, detail });

/** The service is up but a dependency is not — distinct from a 500. */
export const unavailable = (message: string, detail?: unknown) =>
  json(503, { error: message, detail });
