// prince.ts - Complete framework with route-level middleware
// @ts-nocheck 
/// <reference types="bun-types" />
import type { OpenAPISpec, OpenAPIBuilder, ScalarOptions } from "./scheduler";
import { openapi as buildOpenAPI } from "./scheduler";
import { z } from "zod";

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
  cookies?: Record<string, string>;
  ip?: string;
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
  cookieHeader.split(";").forEach((pair) => {
    const [name, ...value] = pair.split("=");
    if (name) cookies[decodeURIComponent(name.trim())] = decodeURIComponent((value.join("=") || "").trim());
  });
  return cookies;
}

// ─── IP detection helpers ──────────────────────────────────────────────────
function detectIP(req: Request): string {
  // Check X-Forwarded-For (first IP, may contain multiple comma-separated IPs)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  
  // Check X-Real-IP (often used by proxies like Nginx)
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  
  // Check Cloudflare
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  
  // Check other common headers
  const clientIp = req.headers.get("x-client-ip");
  if (clientIp) return clientIp;
  
  // Fallback to 127.0.0.1 for localhost
  return "127.0.0.1";
}

// ─── Zod → JSON Schema converter ────────────────────────────────────────────
// Lightweight recursive converter — covers the common cases without pulling in
// the full zod-to-json-schema package.

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const d = (schema as any)._def;
  const typeName: string = d?.typeName ?? d?.type ?? "";

  // ── String ───────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodString || typeName === "ZodString") {
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
  if (schema instanceof z.ZodNumber || typeName === "ZodNumber") {
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
  if (schema instanceof z.ZodBoolean || typeName === "ZodBoolean") return { type: "boolean" };
  if (schema instanceof z.ZodNull    || typeName === "ZodNull")    return { type: "null" };

  // ── Literal ──────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodLiteral || typeName === "ZodLiteral") {
    const val = d.value ?? d.values?.[0];
    return { enum: [val] };
  }

  // ── Enum ─────────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodEnum || typeName === "ZodEnum") {
    // v3: _def.values = ["a","b"]  |  v4: _def.entries = {a:"a",b:"b"} or _def.options
    const vals = d.values
      ?? (d.entries ? Object.values(d.entries) : undefined)
      ?? d.options
      ?? [];
    return { type: "string", enum: vals };
  }

  // ── Array ─────────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodArray || typeName === "ZodArray") {
    const items = d.element ?? d.type ?? d.items;
    return { type: "array", items: items ? zodToJsonSchema(items) : {} };
  }

  // ── Optional / Nullable ──────────────────────────────────────────────────
  if (schema instanceof z.ZodOptional || typeName === "ZodOptional" ||
      schema instanceof z.ZodNullable || typeName === "ZodNullable") {
    return zodToJsonSchema(d.innerType ?? d.type);
  }

  // ── Default ──────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodDefault || typeName === "ZodDefault") {
    const inner = zodToJsonSchema(d.innerType ?? d.type);
    const dv = d.defaultValue ?? d.default;
    return { ...inner, default: typeof dv === "function" ? dv() : dv };
  }

  // ── Object ───────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodObject || typeName === "ZodObject") {
    // v3: shape is a plain object  |  v4: shape may also be a plain object
    const shape: Record<string, z.ZodTypeAny> = d.shape ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const v = val as z.ZodTypeAny;
      const vd = (v as any)._def;
      const vType = vd?.typeName ?? vd?.type ?? "";
      properties[key] = zodToJsonSchema(v);
      const isOptional = v instanceof z.ZodOptional || vType === "ZodOptional"
        || v instanceof z.ZodDefault  || vType === "ZodDefault";
      if (!isOptional) required.push(key);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  }

  // ── Union ─────────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodUnion || typeName === "ZodUnion") {
    return { oneOf: (d.options ?? []).map(zodToJsonSchema) };
  }

  // ── Intersection ──────────────────────────────────────────────────────────
  if (schema instanceof z.ZodIntersection || typeName === "ZodIntersection") {
    return { allOf: [d.left, d.right].map(zodToJsonSchema) };
  }

  // ── Record ────────────────────────────────────────────────────────────────
  if (schema instanceof z.ZodRecord || typeName === "ZodRecord") {
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
    const vTypeName = (v as any)._def?.typeName ?? (v as any)._def?.type ?? "";
    const isOptional = v instanceof z.ZodOptional || vTypeName === "ZodOptional"
      || v instanceof z.ZodDefault || vTypeName === "ZodDefault";
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

export class Prince {
  private rawRoutes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];
  private errorHandler?: (err: any, req: PrinceRequest) => Response;
  private wsRoutes: Record<string, WebSocketHandler> = {};
  private openapiSpec: OpenAPISpec | null = null;
  private router: RadixNode | null = null;
  private staticRoutes: Map<string, RouteHandler> = new Map();
  private staticMiddlewares: Map<string, Middleware[]> = new Map();
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
    if (route.middlewares.length > 0) {
      currentNode.middlewares[route.method] = route.middlewares;
    }
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

    // Static route fast path
    const staticKey = `${method}:${pathname}`;
    const staticHandler = this.staticRoutes.get(staticKey);
    if (staticHandler) {
      const result = { 
        handler: staticHandler, 
        params: {},
        middlewares: this.staticMiddlewares.get(staticKey) || []
      };
      this.routeCache.set(cacheKey, result);
      return result;
    }

    // Radix tree lookup
    const segments = pathname === "/" ? [""] : pathname.split("/").slice(1);
    const result = this.matchRoute(this.buildRouter(), segments, method);
    
    if (result) {
      this.routeCache.set(cacheKey, result);
      return result;
    }

    // Check for 405 by looking for other methods at this path
    const allowedMethods = new Set<string>();
    for (const route of this.rawRoutes) {
      if (this.matchPath(route.path, pathname)) {
        allowedMethods.add(route.method);
      }
    }

    if (allowedMethods.size > 0) {
      const methodNotAllowed = { 
        handler: null as any, 
        params: {},
        middlewares: [],
        allowedMethods: Array.from(allowedMethods) 
      };
      this.routeCache.set(cacheKey, methodNotAllowed);
      return methodNotAllowed;
    }

    this.routeCache.set(cacheKey, null!);
    return null;
  }

  private matchPath(routePath: string, requestPath: string): boolean {
    const routeParts = routePath === "/" ? [""] : routePath.split("/").slice(1);
    const requestParts = requestPath === "/" ? [""] : requestPath.split("/").slice(1);
    
    if (routeParts.length !== requestParts.length) {
      if (routeParts.includes('**')) return true;
      return false;
    }

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const requestPart = requestParts[i];

      if (routePart.startsWith(':') || routePart === '*' || routePart === '**') {
        continue;
      }
      
      if (routePart !== requestPart) {
        return false;
      }
    }

    return true;
  }

  private matchRoute(node: RadixNode, segments: string[], method: string, params: Record<string, string> = {}, index = 0): { handler: RouteHandler; params: Record<string, string>; middlewares: Middleware[] } | null {
    if (index === segments.length) {
      const handler = node.handlers[method];
      const middlewares = node.middlewares[method] || [];
      return handler ? { handler, params, middlewares } : null;
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
        params[child.paramName] = segment;
        const result = this.matchRoute(child, segments, method, params, index + 1);
        if (result) return result;
        delete params[child.paramName];
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
        const middlewares = child.middlewares[method] || [];
        if (handler) {
          return { handler, params, middlewares };
        }
      }
    }

    return null;
  }

  private async parseBody(req: Request): Promise<any> {
    const ct = req.headers.get("content-type") || "";
    const clonedReq = req.clone();
    
    try {
      if (ct.includes("application/json")) {
        return await clonedReq.json();
      }

      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await clonedReq.text();
        return Object.fromEntries(new URLSearchParams(text));
      }

      if (ct.startsWith("multipart/form-data")) {
        const fd = await clonedReq.formData();
        const files: Record<string, File> = {};
        const fields: Record<string, string> = {};
        for (const [k, v] of fd.entries()) {
          if (v instanceof File) files[k] = v;
          else fields[k] = v as string;
        }
        return { files, fields };
      }

      if (ct.startsWith("text/")) {
        return await clonedReq.text();
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
    query: URLSearchParams,
    routeMiddlewares: Middleware[],
    method: string,
    pathname: string
  ): Promise<Response> {
    req.params = params;
    req.query = query;
    req.cookies = parseCookies(req.headers.get("cookie") || "");
    req.ip = detectIP(req);

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

    // OPTIMIZED: Only create combined array if route has middleware
    const allMiddlewares = routeMiddlewares.length > 0 
      ? [...this.middlewares, ...routeMiddlewares]
      : this.middlewares;
    
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

    // Call onAfterHandle hooks
    for (const hook of this.onAfterHandleHooks) {
      await hook(req, response.clone(), pathname, method);
    }

    return response;
  }

  async handleFetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const r = req as PrinceRequest;
    const method = req.method;
    const pathname = url.pathname;

    // Call onRequest hooks
    for (const hook of this.onRequestHooks) {
      await hook(r);
    }

    const routeMatch = this.findRoute(method, pathname);
    
    if (!routeMatch) {
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

    return this.executeHandler(r, routeMatch.handler, routeMatch.params, url.searchParams, routeMatch.middlewares, method, pathname);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;
    
    try {
      return await this.handleFetch(req);
    } catch (err) {
      // Call onError hooks
      for (const hook of this.onErrorHooks) {
        await hook(err, req as PrinceRequest, pathname, method);
      }

      if (this.errorHandler) return this.errorHandler(err, req as PrinceRequest);
      if (this.devMode) {
        console.error("Error:", err);
        return this.json({ error: String(err), stack: err.stack }, 500);
      }
      return this.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * Mounts an OpenAPI spec + Scalar UI onto this Prince app.
   *
   * Calling this method returns an `OpenAPIBuilder` whose `.route()` method
   * registers a route on the Prince app **and** writes the matching path entry
   * into the OpenAPI spec simultaneously — so the two can never drift.
   *
   * Two routes are auto-registered:
   *   GET `docsPath`        → Scalar UI  (e.g. /docs)
   *   GET `docsPath`.json   → Raw spec   (e.g. /docs.json)
   *
   * @example
   * const app = prince();
   * const api = app.openapi({ title: "My API", version: "1.0.0" }, "/docs");
   *
   * // Registers GET /hello on Prince AND adds it to the OpenAPI spec
   * api.route("GET", "/hello", {
   *   summary: "Say hello",
   *   responses: { 200: { description: "OK" } },
   * }, (req) => ({ message: "hello" }));
   *
   * app.listen(3000);
   * // → GET /docs      → Scalar UI
   * // → GET /docs.json → raw OpenAPI JSON
   */
  openapi(
    info: { title: string; version: string },
    docsPath = "/docs",
    scalarOptions: ScalarOptions = {}
  ): OpenAPIBuilder & { route: (method: string, path: string, operation: Record<string, unknown>, ...args: (RouteHandler | Middleware)[]) => OpenAPIBuilder } {
    const builder = buildOpenAPI(info);
    this.openapiSpec = builder.spec;

    // Convert Prince path params (:id) to OpenAPI format ({id})
    const toOpenAPIPath = (p: string) => p.replace(/:([^/]+)/g, "{$1}");

    // Serve Scalar UI
    this.get(docsPath, (req: PrinceRequest) => {
      return new Response(
        renderScalarHTML(builder.spec, scalarOptions),
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
    
    Bun.serve({
      port,
      fetch: (req, server) => {
        const url = new URL(req.url);
        
        if (self.wsRoutes[url.pathname] && server.upgrade(req, {
          data: { path: url.pathname }
        })) {
          return;
        }
        
        return self.fetch(req);
      },
      websocket: {
        open(ws) {
          const path = ws.data?.path;
          if (path && self.wsRoutes[path]?.open) {
            self.wsRoutes[path].open!(ws);
          }
        },
        message(ws, message) {
          const path = ws.data?.path;
          if (path && self.wsRoutes[path]?.message) {
            self.wsRoutes[path].message!(ws, message);
          }
        },
        close(ws, code, reason) {
          const path = ws.data?.path;
          if (path && self.wsRoutes[path]?.close) {
            self.wsRoutes[path].close!(ws, code, reason);
          }
        },
        drain(ws) {
          const path = ws.data?.path;
          if (path && self.wsRoutes[path]?.drain) {
            self.wsRoutes[path].drain!(ws);
          }
        }
      }
    });

    console.log(`🚀 PrinceJS running on http://localhost:${port}`);
  }
}

// Internal helper — renders Scalar HTML from a spec object.
// Kept here (not imported) so prince.ts stays self-contained for the UI route.
function renderScalarHTML(spec: OpenAPISpec, options: ScalarOptions = {}): string {
  const {
    pageTitle = (spec.info.title as string) ?? "API Reference",
    theme = "default",
    layout = "modern",
    hideDownloadButton = false,
    customCss = "",
  } = options;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    ${customCss ? `<style>${customCss}</style>` : ""}
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json"
      data-theme="${theme}"
      data-layout="${layout}"
      ${hideDownloadButton ? 'data-hide-download-button="true"' : ""}
    >${JSON.stringify(spec)}</script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

export const prince = (dev = false) => new Prince(dev);