/**
 * princejs/client - End-to-end type-safe API client
 *
 * Define an API contract shared between server and client. The client infers
 * request/response types from the contract—no code generation required.
 *
 * @example
 * // shared/api.ts - Define contract (shared or imported by both server & client)
 * export type ApiContract = {
 *   "GET /health": { response: { ok: boolean } };
 *   "GET /users/:id": { params: { id: string }; response: { id: string; name: string } };
 *   "POST /users": { body: { name: string }; response: { id: string; name: string } };
 * };
 *
 * @example
 * // client.ts
 * import { createClient } from "princejs/client";
 * import type { ApiContract } from "./shared/api";
 *
 * const client = createClient<ApiContract>("http://localhost:3000");
 *
 * const health = await client.get("/health");        // { ok: boolean }
 * const user = await client.get("/users/:id", { params: { id: "1" } });
 * const created = await client.post("/users", { body: { name: "Alice" } });
 */

// --- Contract types ---

/** A single route in the API contract. Key format: "METHOD /path/:param" */
export interface RouteDef {
  /** Path params (e.g. { id: string } for /users/:id) */
  params?: Record<string, string>;
  /** Query params shape (optional, for type hints) */
  query?: Record<string, string>;
  /** Request body for POST/PUT/PATCH */
  body?: unknown;
  /** Response type (default: unknown) */
  response?: unknown;
}

/** API contract: maps "METHOD /path" to route definition */
export type PrinceApiContract = Record<string, RouteDef>;

// --- Type helpers ---

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Extract route keys for a method */
type KeysForMethod<C extends PrinceApiContract, M extends Method> = Extract<
  keyof C,
  `${M} ${string}`
>;

/** Path part from key "GET /users/:id" -> "/users/:id" */
type PathFromKey<K extends string> = K extends `${Method} ${infer P}` ? P : never;

/** Route def for a key */
type DefFor<C extends PrinceApiContract, K extends keyof C> = C[K] extends RouteDef
  ? C[K]
  : never;

/** Response type from route def */
type ResponseType<D> = D extends { response?: infer R } ? R : unknown;

/** Params type from route def */
type ParamsType<D> = D extends { params?: infer P } ? P : Record<string, never>;

/** Body type from route def */
type BodyType<D> = D extends { body?: infer B } ? B : undefined;

/** Options for GET/DELETE (params, query) */
type GetOpts<D> = ParamsType<D> extends Record<string, never>
  ? { params?: never; query?: Record<string, string> }
  : { params: ParamsType<D>; query?: Record<string, string> };

/** Options for POST/PUT/PATCH */
type MutateOpts<D> = ParamsType<D> extends Record<string, never>
  ? { body: BodyType<D>; query?: Record<string, string> }
  : { params: ParamsType<D>; body: BodyType<D>; query?: Record<string, string> };

// --- Runtime helpers ---

function buildPath(pattern: string, params?: Record<string, string>): string {
  if (!params) return pattern;
  let out = pattern;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`:${k}`, encodeURIComponent(v));
  }
  return out;
}

function buildUrl(base: string, path: string, query?: Record<string, string>): string {
  const url = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- Client implementation ---

export interface ClientOptions {
  /** Base fetch init (headers, credentials, etc.) */
  init?: RequestInit;
}

/**
 * Create an end-to-end type-safe API client from a contract.
 * Share the contract type between server and client for full type safety.
 */
export function createClient<C extends PrinceApiContract>(
  baseUrl: string,
  options?: ClientOptions
): PrinceClient<C> {
  const base = baseUrl.replace(/\/$/, "");
  const init = options?.init ?? {};

  const get = async <K extends KeysForMethod<C, "GET">>(
    path: PathFromKey<K>,
    opts?: GetOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>> => {
    const def = {} as RouteDef;
    const params = opts && "params" in opts ? opts.params : undefined;
    const query = opts?.query;
    const builtPath = buildPath(path, params);
    const url = buildUrl(base, builtPath, query);
    return fetchJson(url, init);
  };

  const post = async <K extends KeysForMethod<C, "POST">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>> => {
    const params = opts && "params" in opts ? opts.params : undefined;
    const body = opts && "body" in opts ? opts.body : undefined;
    const query = opts?.query;
    const builtPath = buildPath(path, params);
    const url = buildUrl(base, builtPath, query);
    return fetchJson(url, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  const put = async <K extends KeysForMethod<C, "PUT">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>> => {
    const params = opts && "params" in opts ? opts.params : undefined;
    const body = opts && "body" in opts ? opts.body : undefined;
    const query = opts?.query;
    const builtPath = buildPath(path, params);
    const url = buildUrl(base, builtPath, query);
    return fetchJson(url, {
      ...init,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  const patch = async <K extends KeysForMethod<C, "PATCH">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>> => {
    const params = opts && "params" in opts ? opts.params : undefined;
    const body = opts && "body" in opts ? opts.body : undefined;
    const query = opts?.query;
    const builtPath = buildPath(path, params);
    const url = buildUrl(base, builtPath, query);
    return fetchJson(url, {
      ...init,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  const del = async <K extends KeysForMethod<C, "DELETE">>(
    path: PathFromKey<K>,
    opts?: GetOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>> => {
    const params = opts && opts.params ? opts.params : undefined;
    const query = opts?.query;
    const builtPath = buildPath(path, params);
    const url = buildUrl(base, builtPath, query);
    return fetchJson(url, { ...init, method: "DELETE" });
  };

  return {
    get,
    post,
    put,
    patch,
    delete: del,
    /** Raw fetch for custom requests */
    fetch: (path: string, reqInit?: RequestInit) =>
      globalThis.fetch(`${base}${path}`, { ...init, ...reqInit }),
  } as PrinceClient<C>;
}

/** Typed client interface */
export interface PrinceClient<C extends PrinceApiContract> {
  get<K extends KeysForMethod<C, "GET">>(
    path: PathFromKey<K>,
    opts?: GetOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>>;
  post<K extends KeysForMethod<C, "POST">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>>;
  put<K extends KeysForMethod<C, "PUT">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>>;
  patch<K extends KeysForMethod<C, "PATCH">>(
    path: PathFromKey<K>,
    opts: MutateOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>>;
  delete<K extends KeysForMethod<C, "DELETE">>(
    path: PathFromKey<K>,
    opts?: GetOpts<DefFor<C, K>>
  ): Promise<ResponseType<DefFor<C, K>>>;
  /** Raw fetch (untyped) for custom requests */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}
