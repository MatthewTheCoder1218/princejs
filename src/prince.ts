// prince.ts - Complete framework with route-level middleware
/// <reference types="bun-types" />
import type { OpenAPIBuilder, ScalarOptions } from "./scheduler";
import { openapi as buildOpenAPI, renderScalarHtml } from "./scheduler";
import type { z } from "zod";

type Next = () => Promise<Response>;
type Middleware = (req: PrinceRequest, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;

export interface PrinceRequest extends Request {
  parsedBody?: any;
  files?: Record<string, File>;
  user?: any;
  params?: Record<string, string>;
  query?: URLSearchParams;
  session?: any;
  apiKey?: string;
  sseSend?: (data: any, event?: string, id?: string) => void;
  streamSend?: (chunk: string | Uint8Array) => void;
  streamClose?: () => void;
  streamError?: (e: any) => void;
  cookies?: Record<string, string>;
  ip?: string;
  id?: string;
  [key: string]: any;
}

// Lifecycle hooks
export type OnRequest = (req: PrinceRequest) => void | Promise<void>;
export type OnBeforeHandle = (req: PrinceRequest, path: string, method: string) => void | Promise<void>;
export type OnAfterHandle = (req: PrinceRequest, res: Response, path: string, method: string) => void | Promise<void>;
export type OnError = (err: any, req: PrinceRequest, path: string, method: string) => void | Promise<void>;

interface WebSocketHandler {
  open?: (ws: any) => void;
  message?: (ws: any, msg: string | Buffer) => void;
  close?: (ws: any, code?: number, reason?: string) => void;
  drain?: (ws: any) => void;
}

type RouteHandler = (req: PrinceRequest) => Promise<HandlerResult> | HandlerResult;

type RouteEntry = {
  method: string;
  path: string;
  parts: string[];
  handler: RouteHandler;
  middlewares: Middleware[];
};

interface RadixNode {
  pattern: string;
  handlers: Record<string, RouteHandler>;
  middlewares: Record<string, Middleware[]>;
  // Pre-composed: global middlewares + route middlewares merged at registration time
  composedMiddlewares: Record<string, Middleware[]>;
  // All methods registered at this node — used for 405 detection without a scan
  allowedMethods: Set<string>;
  children: RadixNode[];
  paramName?: string;
  isWildcard?: boolean;
  isCatchAll?: boolean;
}

// Simple plugin type: receives the app instance and optional options
export type PrincePlugin<TOptions = any> = (
  app: Prince,
  options?: TOptions
) => void | Promise<void>;

class ResponseBuilder {
  private _status = 200;
  private _headers: Record<string, string> = {};
  private _body: any = null;

  status(code: number) {
    this._status = code;
    return this;
  }

  header(key: string, value: string) {
    this._headers[key] = value;
    return this;
  }

  json(data: any) {
    this._headers["Content-Type"] = "application/json";
    this._body = JSON.stringify(data);
    return this;
  }

  text(data: string) {
    this._headers["Content-Type"] = "text/plain";
    this._body = data;
    return this;
  }

  html(data: string) {
    this._headers["Content-Type"] = "text/html";
    this._body = data;
    return this;
  }

  redirect(url: string, status = 302) {
    this._status = status;
    this._headers["Location"] = url;
    return this;
  }

  cookie(name: string, value: string, options?: { maxAge?: number; path?: string; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "Strict" | "Lax" | "None" }) {
    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    if (options?.maxAge) cookieStr += `; Max-Age=${options.maxAge}`;
    if (options?.path) cookieStr += `; Path=${options.path}`;
    if (options?.domain) cookieStr += `; Domain=${options.domain}`;
    if (options?.secure) cookieStr += "; Secure";
    if (options?.httpOnly) cookieStr += "; HttpOnly";
    if (options?.sameSite) cookieStr += `; SameSite=${options.sameSite}`;
    const existing = this._headers["Set-Cookie"];
    this._headers["Set-Cookie"] = existing ? `${existing}, ${cookieStr}` : cookieStr;
    return this;
  }

  build() {
    return new Response(this._body, { status: this._status, headers: this._headers });
  }
}

// ─── Cookie helpers ────────────────────────────────────────────────────────
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const len = cookieHeader.length;
  let i = 0;
  while (i < len) {
    // skip leading spaces
    while (i < len && cookieHeader.charCodeAt(i) === 32) i++;
    const eqIdx = cookieHeader.indexOf("=", i);
    if (eqIdx === -1) break;
    const semIdx = cookieHeader.indexOf(";", eqIdx);
    const end = semIdx === -1 ? len : semIdx;
    const name = cookieHeader.slice(i, eqIdx).trimEnd();
    const val  = cookieHeader.slice(eqIdx + 1, end).trim();
    if (name) {
      try {
        cookies[decodeURIComponent(name)] = decodeURIComponent(val);
      } catch {
        cookies[name] = val;
      }
    }
    i = end + 1;
  }
  return cookies;
}

// ─── Fast pathname extraction ──────────────────────────────────────────────
// Avoids allocating a full URL object on every request.
// Bun's req.url is always an absolute URL like "http://host/path?query"
// We find the third "/" (end of "http://host") then slice to "?" or end.
function extractPathname(url: string): string {
  // Skip "http://" or "https://"
  const slashSlash = url.indexOf("//");
  if (slashSlash === -1) return "/";
  const pathStart = url.indexOf("/", slashSlash + 2);
  if (pathStart === -1) return "/";
  const qIdx = url.indexOf("?", pathStart);
  return qIdx === -1 ? url.slice(pathStart) : url.slice(pathStart, qIdx);
}

// Extract raw query string without allocating URLSearchParams eagerly
function extractSearch(url: string): string {
  const qIdx = url.indexOf("?");
  return qIdx === -1 ? "" : url.slice(qIdx + 1);
}

// ─── IP detection ──────────────────────────────────────────────────────────
function detectIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const comma = forwarded.indexOf(",");
    return comma === -1 ? forwarded.trim() : forwarded.slice(0, comma).trim();
  }
  return req.headers.get("x-real-ip")
    ?? req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-client-ip")
    ?? "127.0.0.1";
}

// ─── Zod → JSON Schema converter ────────────────────────────────────────────
// Lightweight recursive converter — covers the common cases without pulling in
// the full zod-to-json-schema package. Duck-types the schema so it works with
// zod v3 and v4 without princejs ever importing zod at runtime — users pass in
// their own zod schemas, so zod stays an optional install.

const ZOD_KIND_MAP: Record<string, string> = {
  ZodString: "string",   ZodNumber: "number",   ZodBoolean: "boolean",  ZodNull: "null",
  ZodLiteral: "literal", ZodEnum: "enum",       ZodArray: "array",      ZodRecord: "record",
  ZodObject: "object",   ZodUnion: "union",     ZodIntersection: "intersection",
  ZodOptional: "optional", ZodNullable: "nullable", ZodDefault: "default",
  ZodDate: "date", ZodBigInt: "bigint", ZodAny: "any", ZodUnknown: "unknown",
};
const OPTIONAL_KINDS = ["optional", "nullable", "default"];

const zodKind = (schema: any): string => {
  const d = schema?._def ?? {};
  const v4d = schema?._zod?.def ?? {};
  const raw: string = d?.typeName ?? d?.type ?? v4d?.type ?? "";
  return ZOD_KIND_MAP[raw] ?? raw;
};

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const d = (schema as any)._def;
  const kind = zodKind(schema);

  // ── String ───────────────────────────────────────────────────────────────
  if (kind === "string") {
    const s: any = { type: "string" };
    const checks: any[] = d.checks ?? [];
    for (const c of checks) {
      // Zod v3: c.kind + c.value
      if (c.kind === "min")   s.minLength = c.value;
      if (c.kind === "max")   s.maxLength = c.value;
      if (c.kind === "email") s.format = "email";
      if (c.kind === "url")   s.format = "uri";
      if (c.kind === "uuid")  s.format = "uuid";
      if (c.kind === "regex") s.pattern = c.regex?.source ?? c.pattern;
      // Zod v4: all data is inside c._zod.def
      const def = c._zod?.def ?? {};
      if (def.check === "min_length") s.minLength = def.minimum;
      if (def.check === "max_length") s.maxLength = def.maximum;
      if (def.check === "string_format") {
        if (def.format === "email") s.format = "email";
        if (def.format === "url")   s.format = "uri";
        if (def.format === "uuid")  s.format = "uuid";
        if (def.format === "regex") s.pattern = def.pattern;
      }
    }
    return s;
  }

  // ── Number ───────────────────────────────────────────────────────────────
  if (kind === "number") {
    const s: any = { type: "number" };
    const checks: any[] = d.checks ?? [];
    for (const c of checks) {
      // Zod v3: c.kind + c.value
      if (c.kind === "min") s.minimum = c.value ?? c.minimum;
      if (c.kind === "max") s.maximum = c.value ?? c.maximum;
      if (c.kind === "int") s.type = "integer";
      if (c.kind === "multipleOf") s.multipleOf = c.value;
      // Zod v4: all data is inside c._zod.def
      const def = c._zod?.def ?? {};
      if (def.check === "greater_than" || def.check === "greater_than_or_equal") s.minimum = def.value;
      if (def.check === "less_than"    || def.check === "less_than_or_equal")    s.maximum = def.value;
      if (def.check === "number_format" && (def.format === "safeint" || def.format === "int32" || def.format === "int64")) s.type = "integer";
      if (def.check === "multiple_of") s.multipleOf = def.value;
    }
    return s;
  }

  // ── Boolean ──────────────────────────────────────────────────────────────
  if (kind === "boolean") return { type: "boolean" };
  if (kind === "null")    return { type: "null" };

  // ── Literal ──────────────────────────────────────────────────────────────
  if (kind === "literal") {
    const val = d.value ?? d.values?.[0];
    return { enum: [val] };
  }

  // ── Enum ─────────────────────────────────────────────────────────────────
  if (kind === "enum" || kind === "nativeEnum") {
    // v3: _def.values = ["a","b"]  |  v4: _def.entries = {a:"a",b:"b"} or _def.options
    const vals = d.values
      ?? (d.entries ? Object.values(d.entries) : undefined)
      ?? d.options
      ?? [];
    return { type: "string", enum: vals };
  }

  // ── Array ─────────────────────────────────────────────────────────────────
  if (kind === "array") {
    const items = d.element ?? d.type ?? d.items;
    return { type: "array", items: items ? zodToJsonSchema(items) : {} };
  }

  // ── Optional / Nullable ──────────────────────────────────────────────────
  if (kind === "optional" || kind === "nullable") {
    return zodToJsonSchema(d.innerType ?? d.type);
  }

  // ── Default ──────────────────────────────────────────────────────────────
  if (kind === "default") {
    const inner = zodToJsonSchema(d.innerType ?? d.type);
    const dv = d.defaultValue ?? d.default;
    return { ...inner, default: typeof dv === "function" ? dv() : dv };
  }

  // ── Object ───────────────────────────────────────────────────────────────
  if (kind === "object") {
    // v3: shape is a plain object  |  v4: shape may also be a plain object
    const shape: Record<string, z.ZodTypeAny> = d.shape ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const v = val as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(v);
      if (!OPTIONAL_KINDS.includes(zodKind(v))) required.push(key);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  }

  // ── Union ─────────────────────────────────────────────────────────────────
  if (kind === "union") {
    return { oneOf: (d.options ?? []).map(zodToJsonSchema) };
  }

  // ── Intersection ──────────────────────────────────────────────────────────
  if (kind === "intersection") {
    return { allOf: [d.left, d.right].map(zodToJsonSchema) };
  }

  // ── Record ────────────────────────────────────────────────────────────────
  if (kind === "record") {
    // v3: _def.valueType                        (two-arg: key schema + value schema)
    // v4: _def.keyType only for single-arg      z.record(ValueSchema) → keyType IS the value schema
    //     _def.keyType + _def.valueType for      z.record(KeySchema, ValueSchema)
    const valueSchema = d.valueType ?? d.valueSchema ?? d.element
      // Zod v4 single-arg: the only schema passed becomes keyType
      ?? (d.keyType && !d.valueType ? d.keyType : undefined);
    return { type: "object", additionalProperties: valueSchema ? zodToJsonSchema(valueSchema) : {} };
  }

  // Fallback
  return {};
}

// Converts a z.ZodObject into OpenAPI query parameter entries
function zodObjectToQueryParams(schema: z.ZodObject<any>): Record<string, unknown>[] {
  const d = (schema as any)._def;
  const shape: Record<string, z.ZodTypeAny> = d.shape ?? {};
  return Object.entries(shape).map(([name, val]) => {
    const v = val as z.ZodTypeAny;
    const isOptional = OPTIONAL_KINDS.includes(zodKind(v));
    return {
      name,
      in: "query",
      required: !isOptional,
      schema: zodToJsonSchema(v),
    };
  });
}

// Merges schema.response into responses, generating a 200 entry if not present.
// Manual responses always win — spread base AFTER the generated 200.
function buildResponses(
  responseSchema?: z.ZodTypeAny,
  existingResponses?: Record<string, unknown>
): Record<string, unknown> {
  const base = existingResponses ?? {};
  if (!responseSchema) return Object.keys(base).length ? base : { 200: { description: "OK" } };
  return {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: zodToJsonSchema(responseSchema),
        },
      },
    },
    ...base,
  };
}

// Import validate from middleware — used to auto-wire body validation
import { validate } from "./middleware";

// ─── RouteOperation type ─────────────────────────────────────────────────────

export interface RouteSchema {
  /** Zod schema for the request body — auto-wires validate() middleware */
  body?: z.ZodTypeAny;
  /** Zod schema for query parameters — written into the OpenAPI spec */
  query?: z.ZodObject<any>;
  /** Zod schema for the response body — written into the OpenAPI spec */
  response?: z.ZodTypeAny;
}

export interface RouteOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  /** Attach Zod schemas to auto-generate request/response models in Scalar */
  schema?: RouteSchema;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

// guard() — apply body validation to a group of routes.
// Use as shared middleware in app.group():
//   app.group("/users", guard({ body: userSchema }), (r) => { ... })
// or standalone:
//   app.post("/users", guard({ body: userSchema }), handler)
export function guard(schema: { body?: z.ZodTypeAny }): Middleware {
  if (!schema.body) return (_req, next) => next();
  return validate(schema.body) as unknown as Middleware;
}

// GroupRouter — returned by app.group(), scoped to the prefix
export interface GroupRouter {
  get(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
  post(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
  put(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
  patch(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
  delete(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
  options(path: string, ...args: (RouteHandler | Middleware)[]): GroupRouter;
}

export class Prince {
  private rawRoutes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];
  private errorHandler?: (err: any, req: PrinceRequest) => Response;
  private wsRoutes: Record<string, WebSocketHandler> = {};
  private router: RadixNode | null = null;
  private staticRoutes: Map<string, RouteHandler> = new Map();
  private staticMiddlewares: Map<string, Middleware[]> = new Map();
  // Pre-composed [globalMiddlewares..., routeMiddlewares...] stored at registration time
  private staticComposed: Map<string, Middleware[]> = new Map();
  private routeCache = new Map<string, { 
    handler: RouteHandler; 
    params: Record<string, string>;
    middlewares: Middleware[];
    allowedMethods?: string[];
  }>();
  
  // Lifecycle hooks
  private onRequestHooks: OnRequest[] = [];
  private onBeforeHandleHooks: OnBeforeHandle[] = [];
  private onAfterHandleHooks: OnAfterHandle[] = [];
  private onErrorHooks: OnError[] = [];

  constructor(private devMode = false) {}

  use(mw: Middleware) {
    this.middlewares.push(mw);
    // Invalidate caches — lazy composition in findRoute/matchRoute must pick up the new global
    this.routeCache.clear();
    this.staticComposed.clear();
    this.router = null; // force trie rebuild so composedMiddlewares are re-baked at listen()
    return this;
  }

  /**
   * Lightweight plugin system: allows sharing bundles of routes/middleware.
   *
   * @example
   * const usersPlugin: PrincePlugin<{ prefix?: string }> = (app, opts) => {
   *   const base = opts?.prefix ?? "";
   *   app.get(`${base}/users`, () => [{ id: 1 }]);
   * };
   *
   * app.plugin(usersPlugin, { prefix: "/api" });
   */
  plugin<TOptions = any>(plugin: PrincePlugin<TOptions>, options?: TOptions) {
    // Plugin can synchronously register routes/middleware.
    // If it returns a Promise, it should handle its own async work internally.
    void plugin(this, options as TOptions);
    return this;
  }

  error(fn: (err: any, req: PrinceRequest) => Response) {
    this.errorHandler = fn;
    return this;
  }

  onRequest(hook: OnRequest) {
    this.onRequestHooks.push(hook);
    return this;
  }

  onBeforeHandle(hook: OnBeforeHandle) {
    this.onBeforeHandleHooks.push(hook);
    return this;
  }

  onAfterHandle(hook: OnAfterHandle) {
    this.onAfterHandleHooks.push(hook);
    return this;
  }

  onError(hook: OnError) {
    this.onErrorHooks.push(hook);
    return this;
  }

  json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  response() {
    return new ResponseBuilder();
  }

  // ROUTING API - with optional route-level middleware
  get(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("GET", path, args); }
  post(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("POST", path, args); }
  put(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("PUT", path, args); }
  delete(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("DELETE", path, args); }
  patch(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("PATCH", path, args); }
  options(path: string, ...args: (RouteHandler | Middleware)[]) { return this.add("OPTIONS", path, args); }

  /**
   * Group routes under a shared prefix and optional shared middleware.
   * Zero cost at request time — just prefixes paths at registration.
   *
   * @example
   * app.group("/api", (r) => {
   *   r.get("/users", () => ({ users: [] }));        // → GET /api/users
   *   r.post("/users", (req) => req.parsedBody);      // → POST /api/users
   * });
   *
   * // With shared middleware
   * app.group("/admin", auth(), (r) => {
   *   r.get("/stats", () => ({ ok: true }));          // → GET /admin/stats
   * });
   */
  group(prefix: string, ...args: any[]) {
    // Last arg is always the callback, rest are shared middlewares
    const cb: (router: GroupRouter) => void = args[args.length - 1];
    const sharedMw: Middleware[] = args.slice(0, -1);
    if (!prefix.startsWith("/")) prefix = "/" + prefix;
    if (prefix.endsWith("/")) prefix = prefix.slice(0, -1);

    const self = this;
    // GroupRouter wraps each method call to prepend the prefix and shared mw
    const router: GroupRouter = {
      get:     (p, ...a) => { self.add("GET",     prefix + p, sharedMw.concat(a as any)); return router; },
      post:    (p, ...a) => { self.add("POST",    prefix + p, sharedMw.concat(a as any)); return router; },
      put:     (p, ...a) => { self.add("PUT",     prefix + p, sharedMw.concat(a as any)); return router; },
      patch:   (p, ...a) => { self.add("PATCH",   prefix + p, sharedMw.concat(a as any)); return router; },
      delete:  (p, ...a) => { self.add("DELETE",  prefix + p, sharedMw.concat(a as any)); return router; },
      options: (p, ...a) => { self.add("OPTIONS", prefix + p, sharedMw.concat(a as any)); return router; },
    };
    cb(router);
    return this;
  }

  ws(path: string, handlers: WebSocketHandler) {
    this.wsRoutes[path] = handlers;
    return this;
  }

  private add(method: string, path: string, args: (RouteHandler | Middleware)[]) {
    if (!path.startsWith("/")) path = "/" + path;
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
    const parts = path === "/" ? [""] : path.split("/").slice(1);
    
    // Last arg is always the handler, rest are middleware
    const handler = args[args.length - 1] as RouteHandler;
    const middlewares = args.slice(0, -1) as Middleware[];
    
    this.rawRoutes.push({ method, path, parts, handler, middlewares });
    
    // Cache static routes
    const isStaticRoute = !parts.some(part => 
      part.includes(':') || part.includes('*') || part.includes('(')
    );
    
    if (isStaticRoute) {
      const staticKey = `${method}:${path}`;
      this.staticRoutes.set(staticKey, handler);
      if (middlewares.length > 0) {
        this.staticMiddlewares.set(staticKey, middlewares);
      }
    }
    
    this.routeCache.clear();
    this.router = null;
    return this;
  }

  private buildRouter(): RadixNode {
    if (this.router) return this.router;

    const root: RadixNode = {
      pattern: '',
      handlers: {},
      middlewares: {},
      composedMiddlewares: {},
      allowedMethods: new Set(),
      children: []
    };

    for (const route of this.rawRoutes) {
      if (this.staticRoutes.has(`${route.method}:${route.path}`)) {
        continue;
      }
      this.insertRoute(root, route);
    }

    this.router = root;
    return root;
  }

  private insertRoute(node: RadixNode, route: RouteEntry) {
    let currentNode = node;
    
    for (let i = 0; i < route.parts.length; i++) {
      const part = route.parts[i];
      let found = false;

      for (const child of currentNode.children) {
        if (child.pattern === part) {
          currentNode = child;
          found = true;
          break;
        }
      }

      if (!found) {
        const newNode: RadixNode = {
          pattern: part,
          handlers: {},
          middlewares: {},
          composedMiddlewares: {},
          allowedMethods: new Set(),
          children: []
        };

        if (part.startsWith(':')) {
          newNode.paramName = part.slice(1);
        } else if (part === '*') {
          newNode.isWildcard = true;
        } else if (part === '**') {
          newNode.isCatchAll = true;
        }

        currentNode.children.push(newNode);
        currentNode = newNode;
      }
    }

    currentNode.handlers[route.method] = route.handler;
    currentNode.allowedMethods.add(route.method);
    // Pre-compose: global middlewares are not yet known at build time for dynamic
    // routes (they're composed in buildRouter after all routes are inserted).
    // We store route-level middlewares here; final composition happens in
    // composeRouterMiddlewares() called from listen().
    if (route.middlewares.length > 0) {
      currentNode.middlewares[route.method] = route.middlewares;
    }
  }

  // Compose [globals..., routeMW...] for a single method on demand.
  // Used as fallback when composeRouterMiddlewares() has not been called (e.g. in tests).
  private composeMW(routeMW: Middleware[]): Middleware[] {
    if (this.middlewares.length === 0) return routeMW;
    if (routeMW.length === 0) return this.middlewares;
    return [...this.middlewares, ...routeMW];
  }

  private findRoute(method: string, pathname: string): { 
    handler: RouteHandler; 
    params: Record<string, string>;
    middlewares: Middleware[];
    allowedMethods?: string[];
  } | null {
    const cacheKey = `${method}:${pathname}`;
    
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    // Static route fast path — O(1) map lookup
    const staticHandler = this.staticRoutes.get(cacheKey);
    if (staticHandler) {
      // Use pre-baked composed array if available (post-listen), otherwise compose now
      const composed = this.staticComposed.get(cacheKey)
        ?? this.composeMW(this.staticMiddlewares.get(cacheKey) ?? []);
      const result = { handler: staticHandler, params: {}, middlewares: composed };
      this.routeCache.set(cacheKey, result);
      return result;
    }

    // 405 check for static routes: another method exists at this exact path
    if (this.staticRoutes.size > 0) {
      const methods = ["GET","POST","PUT","PATCH","DELETE","OPTIONS"];
      const allowed = methods.filter(m => m !== method && this.staticRoutes.has(`${m}:${pathname}`));
      if (allowed.length > 0) {
        const r = { handler: null as any, params: {}, middlewares: [], allowedMethods: allowed };
        this.routeCache.set(cacheKey, r);
        return r;
      }
    }

    // Radix tree lookup — 405 detected inside matchRoute via allowedMethods
    const segments = pathname === "/" ? [""] : pathname.split("/").slice(1);
    const result = this.matchRoute(this.buildRouter(), segments, method);
    
    this.routeCache.set(cacheKey, result!);
    return result;
  }

  // Walk the finished trie and bake composed middleware arrays into every node.
  // Called once from listen() after all routes are registered.
  private composeRouterMiddlewares(node: RadixNode) {
    for (const method of Object.keys(node.handlers)) {
      const routeMW = node.middlewares[method] ?? [];
      node.composedMiddlewares[method] =
        this.middlewares.length === 0 ? routeMW
        : routeMW.length === 0 ? this.middlewares
        : [...this.middlewares, ...routeMW];
    }
    for (const child of node.children) {
      this.composeRouterMiddlewares(child);
    }
  }

  // Same for static routes — compose once at listen() time.
  private composeStaticMiddlewares() {
    this.staticComposed.clear();
    for (const [key, handler] of this.staticRoutes) {
      const routeMW = this.staticMiddlewares.get(key) ?? [];
      this.staticComposed.set(
        key,
        this.middlewares.length === 0 ? routeMW
        : routeMW.length === 0 ? this.middlewares
        : [...this.middlewares, ...routeMW]
      );
    }
  }


  private matchRoute(node: RadixNode, segments: string[], method: string, params: Record<string, string> = {}, index = 0): { handler: RouteHandler; params: Record<string, string>; middlewares: Middleware[]; allowedMethods?: string[] } | null {
    if (index === segments.length) {
      const handler = node.handlers[method];
      if (typeof handler === "function") {
        // Use pre-baked composed array if available, else compose lazily
        const middlewares = node.composedMiddlewares[method]
          ?? this.composeMW(node.middlewares[method] ?? []);
        return { handler, params, middlewares };
      }
      // Path matched but wrong method — surface allowed methods for 405
      if (node.allowedMethods.size > 0) {
        return { handler: null as any, params, middlewares: [], allowedMethods: [...node.allowedMethods] };
      }
      return null;
    }

    const segment = segments[index];

    for (const child of node.children) {
      if (!child.paramName && !child.isWildcard && !child.isCatchAll) {
        if (child.pattern === segment) {
          const result = this.matchRoute(child, segments, method, params, index + 1);
          if (result) return result;
        }
      }
    }

    for (const child of node.children) {
      if (child.paramName) {
        const saved = params[child.paramName];
        params[child.paramName] = segment;
        const result = this.matchRoute(child, segments, method, params, index + 1);
        if (result) return result;
        if (saved === undefined) delete params[child.paramName];
        else params[child.paramName] = saved;
      }
    }

    for (const child of node.children) {
      if (child.isWildcard) {
        const result = this.matchRoute(child, segments, method, params, index + 1);
        if (result) return result;
      }
    }

    for (const child of node.children) {
      if (child.isCatchAll) {
        const handler = child.handlers[method];
        if (typeof handler === "function") {
          const middlewares = child.composedMiddlewares[method]
            ?? this.composeMW(child.middlewares[method] ?? []);
          return { handler, params, middlewares };
        }
        if (child.allowedMethods.size > 0) {
          return { handler: null as any, params, middlewares: [], allowedMethods: [...child.allowedMethods] };
        }
      }
    }

    return null;
  }

  private async parseBody(req: Request): Promise<any> {
    const ct = req.headers.get("content-type") || "";
    
    try {
      if (ct.includes("application/json")) {
        return await req.json();
      }

      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        return Object.fromEntries(new URLSearchParams(text));
      }

      // Do NOT consume multipart/form-data here — handlers like upload()
      // need to call req.formData() themselves on the unconsumed stream.
      // executeHandler sets req.files/req.parsedBody only for json/urlencoded.
      if (ct.startsWith("multipart/form-data")) {
        return null;
      }

      if (ct.startsWith("text/")) {
        return await req.text();
      }
    } catch (error) {
      console.error("Body parsing error:", error);
      return null;
    }

    return null;
  }

  private async executeHandler(
    req: PrinceRequest, 
    handler: RouteHandler, 
    params: Record<string, string>, 
    search: string,
    routeMiddlewares: Middleware[],
    method: string,
    pathname: string
  ): Promise<Response> {
    req.params = params;
    // Lazy URLSearchParams — only parsed if handler accesses req.query
    let _query: URLSearchParams | undefined;
    Object.defineProperty(req, "query", {
      get() { return _query ??= new URLSearchParams(search); },
      configurable: true,
    });

    // Lazy cookies — only parsed if handler accesses req.cookies
    Object.defineProperty(req, "cookies", {
      get() {
        const val = parseCookies(req.headers.get("cookie") ?? "");
        Object.defineProperty(req, "cookies", { value: val, configurable: true });
        return val;
      },
      configurable: true,
    });

    // Lazy IP — only resolved if handler accesses req.ip
    Object.defineProperty(req, "ip", {
      get() {
        const val = detectIP(req);
        Object.defineProperty(req, "ip", { value: val, configurable: true });
        return val;
      },
      configurable: true,
    });

    // Only parse body if it hasn't been parsed by middleware already
    if (["POST", "PUT", "PATCH"].includes(req.method) && !req.parsedBody) {
      const parsed = await this.parseBody(req);
      if (parsed) {
        if (typeof parsed === "object" && "files" in parsed && "fields" in parsed) {
          req.parsedBody = parsed.fields;
          req.files = parsed.files;
        } else {
          req.parsedBody = parsed;
        }
      }
    }

    // Call onBeforeHandle hooks
    for (const hook of this.onBeforeHandleHooks) {
      await hook(req, pathname, method);
    }

    // routeMiddlewares is already composed ([globals..., routeMW...]) — no spread needed
    const allMiddlewares = routeMiddlewares;
    
    let i = 0;
    const next = async (): Promise<Response> => {
      while (i < allMiddlewares.length) {
        const result = await allMiddlewares[i++](req, next);
        if (result instanceof Response) return result;
      }

      const res = await handler(req);
      if (res instanceof Response) return res;
      if (res instanceof ResponseBuilder) return res.build();
      if (typeof res === "string") return new Response(res);
      if (res instanceof Uint8Array) return new Response(res);
      return this.json(res);
    };

    const response = await next();

    // Call onAfterHandle hooks — only clone if there are hooks registered
    if (this.onAfterHandleHooks.length > 0) {
      for (const hook of this.onAfterHandleHooks) {
        await hook(req, response, pathname, method);
      }
    }

    return response;
  }

async handleFetch(req: Request): Promise<Response> {
    const rawUrl = req.url;
    const pathname = extractPathname(rawUrl);
    const r = req as PrinceRequest;
    const method = req.method;

    // Call onRequest hooks
    for (const hook of this.onRequestHooks) {
      await hook(r);
    }

    const routeMatch = this.findRoute(method, pathname);
    
    if (!routeMatch) {
      // Trailing-slash redirect only runs when trimTrailingSlash() was registered.
      const trim = (this as any).middlewares.find((m: any) => m.__trimTrailingSlash);
      if (trim && pathname.length > 1 && pathname.endsWith("/")) {
        const search = extractSearch(rawUrl);
        const trimmed = pathname.slice(0, -1) + (search ? `?${search}` : "");
        return new Response(null, { status: trim.__trimTrailingSlash, headers: { Location: trimmed } });
      }
      return this.json({ error: "Not Found" }, 404);
    }

    if (routeMatch.allowedMethods && !routeMatch.handler) {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        { 
          status: 405, 
          headers: { 
            'Allow': routeMatch.allowedMethods.join(', '),
            'Content-Type': 'application/json'
          } 
        }
      );
    }

    const search = extractSearch(rawUrl);
    return this.executeHandler(r, routeMatch.handler, routeMatch.params, search, routeMatch.middlewares, method, pathname);
  }

  async fetch(req: Request): Promise<Response> {
    // Extract pathname once for error handler fallback — no full URL parse needed
    const rawUrl = req.url;
    const method = req.method;

    try {
      return await this.handleFetch(req);
    } catch (err) {
      const pathname = extractPathname(rawUrl);
      // Call onError hooks
      for (const hook of this.onErrorHooks) {
        await hook(err, req as PrinceRequest, pathname, method);
      }

      if (this.errorHandler) return this.errorHandler(err, req as PrinceRequest);
      if (this.devMode) {
        const e = err as Error;
        console.error("Error:", err);
        return this.json({ error: String(err), stack: e.stack }, 500);
      }
      return this.json({ error: "Internal Server Error" }, 500);
    }
  }

  openapi(
    info: { title: string; version: string },
    docsPath = "/docs",
    scalarOptions: ScalarOptions = {}
  ): OpenAPIBuilder & { route: (method: string, path: string, operation: Record<string, unknown>, ...args: (RouteHandler | Middleware)[]) => OpenAPIBuilder } {
    const builder = buildOpenAPI(info);

    // Convert Prince path params (:id) to OpenAPI format ({id})
    const toOpenAPIPath = (p: string) => p.replace(/:([^/]+)/g, "{$1}");

    // Serve Scalar UI
    this.get(docsPath, (req: PrinceRequest) => {
      return new Response(
        renderScalarHtml(builder.spec, scalarOptions),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    });

    // Serve raw spec JSON
    const jsonPath = docsPath.replace(/\/$/, "") + ".json";
    this.get(jsonPath, (_req: PrinceRequest) =>
      new Response(JSON.stringify(builder.spec, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      })
    );

    // Augment builder with a schema-aware route() method that syncs both sides
    const self = this;
    (builder as any).route = function (
      method: string,
      path: string,
      operation: RouteOperation,
      ...args: (RouteHandler | Middleware)[]
    ) {
      const m = method.toUpperCase();
      const { schema, responses: manualResponses, ...operationRest } = operation;

      // --- 1. Auto-wire validate() middleware from schema.body ---
      const middlewares: (RouteHandler | Middleware)[] = [];
      if (schema?.body) {
        middlewares.push(validate(schema.body) as Middleware);
      }
      middlewares.push(...args);
      self.add(m, path, middlewares);

      // --- 2. Build OpenAPI spec entry ---
      const oaPath = toOpenAPIPath(path);
      if (!builder.spec.paths[oaPath]) builder.spec.paths[oaPath] = {};

      // Path params from :id style segments
      const pathParams = [...path.matchAll(/:([^/]+)/g)].map(([, name]) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      }));

      // Query params from schema.query Zod object
      const queryParams = schema?.query
        ? zodObjectToQueryParams(schema.query)
        : [];

      // Request body from schema.body
      const requestBody = schema?.body
        ? {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(schema.body),
              },
            },
          }
        : undefined;

      // Responses — merge schema.response with any manually-defined responses
      const responses = buildResponses(schema?.response, manualResponses as any);

      (builder.spec.paths[oaPath] as any)[m.toLowerCase()] = {
        parameters: [...pathParams, ...queryParams],
        ...(requestBody ? { requestBody } : {}),
        responses,
        ...operationRest,
      };

      return builder;
    };

    return builder as any;
  }

  listen(port = 3000) {
    const self = this;

    // ── Pre-compile everything at startup so the hot path is allocation-free ──
    const router = this.buildRouter();
    this.composeRouterMiddlewares(router);
    this.composeStaticMiddlewares();

    if (typeof (globalThis as any).Bun === "undefined") {
      throw new Error(
        "princejs: listen() requires the Bun runtime (Bun.serve). " +
        "Use the node/vercel/cloudflare/deno adapters instead, or run under bun."
      );
    }
    
    Bun.serve({
      port,
      fetch: (req, server) => {
        // Use fast path extract — avoids new URL() for the WS check
        const pathname = extractPathname(req.url);

        if (self.wsRoutes[pathname] && server.upgrade(req, {
          data: { path: pathname }
        } as any)) {
          return;
        }
        
        return self.fetch(req);
      },
      websocket: {
        open(ws) {
          const path = (ws.data as any)?.path;
          if (path && self.wsRoutes[path]?.open) {
            self.wsRoutes[path].open!(ws);
          }
        },
        message(ws, message) {
          const path = (ws.data as any)?.path;
          if (path && self.wsRoutes[path]?.message) {
            self.wsRoutes[path].message!(ws, message);
          }
        },
        close(ws, code, reason) {
          const path = (ws.data as any)?.path;
          if (path && self.wsRoutes[path]?.close) {
            self.wsRoutes[path].close!(ws, code, reason);
          }
        },
        drain(ws) {
          const path = (ws.data as any)?.path;
          if (path && self.wsRoutes[path]?.drain) {
            self.wsRoutes[path].drain!(ws);
          }
        }
      }
    });

    console.log(`🚀 PrinceJS running on http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);