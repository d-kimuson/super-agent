import { hc } from 'hono/client';
import type { RouteType } from '../server/hono/routes';

type Fetch = typeof fetch;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`HttpError: ${status} ${statusText}`);
  }
}

const customFetch: Fetch = async (...args) => {
  const response = await fetch(...args);
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText);
  }
  return response;
};

export const honoClient = (port: number) => {
  return hc<RouteType>(`http://localhost:${port}`, {
    fetch: customFetch,
  });
};
