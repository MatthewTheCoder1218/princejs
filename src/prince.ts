// @ts-nocheck
/// <reference types="bun-types" />
type Next = () => Promise<Response>;
type Middleware = (req: PrinceRequest, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;

export interface PrinceRequest extends Request {
  body: BodyInit | null;
  json(): Promise<any>;
  text(): Promise<string>;
  formData(): Promise<FormData>;
  arrayBuffer(): Promise<ArrayBuffer>;

  // Your custom stuff
  user?: any;
  params?: Record<string, string>;
  query?: URLSearchParams;
  [key: string]: any;
}

interface WSData {
  ws?: WebSocketHandler;
}

// Add WebSocket handler type
export interface WebSocketHandler {
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
};

class TrieNode {
  children: Record<string, TrieNode> = Object.create(null);
  paramChild?: { name: string; node: TrieNode };
  wildcardChild?: TrieNode;
  catchAllChild?: { name?: string; node: TrieNode };
  handlers: Record<string, RouteHandler> | null = null;
}

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
    return this.build();
  }

  text(data: string) {
    this._headers["Content-Type"] = "text/plain";
    this._body = data;
    return this.build();
  }

  html(data: string) {
    this._headers["Content-Type"] = "text/html";
    this._body = data;
    return this.build();
  }

  redirect(url: string, status = 302) {
    this._status = status;
    this._headers["Location"] = url;
    return this.build();
  }

  stream(cb: (push: (chunk: string) => void, close: () => void) => void) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        cb(
          (chunk) => controller.enqueue(encoder.encode(chunk)),
          () => controller.close()
        );
      }
    });
    return new Response(stream, { status: this._status, headers: this._headers });
  }

  build() {
    return new Response(this._body, { status: this._status, headers: this._headers });
  }
}

export class Prince {
  private rawRoutes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];
  private errorHandler?: (err: any, req: PrinceRequest) => Response;
  private wsRoutes: Record<string, WebSocketHandler> = {};
  private openapiData: any = null;
  private router: TrieNode | null = null; // Cache the router

  constructor(private devMode = false) {}

  use(mw: Middleware) {
    this.middlewares.push(mw);
    return this;
  }

  error(fn: (err: any, req: PrinceRequest) => Response) {
    this.errorHandler = fn;
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

  ws(path: string, options: Partial<WebSocketHandler>) {
    this.wsRoutes[path] = options;
    return this;
  }

  openapi(path = "/docs") {
    const paths: Record<string, any> = {};

    for (const route of this.rawRoutes) {
      paths[route.path] ??= {};
      paths[route.path][route.method.toLowerCase()] = {
        summary: "",
        responses: { 200: { description: "OK" } }
      };
    }

    this.openapiData = {
      openapi: "3.1.0",
      info: { title: "PrinceJS API", version: "1.0.0" },
      paths
    };

    this.get(path, () => this.openapiData);
    return this;
  }

  // ---------------------------
  // ROUTING API
  get(path: string, handler: RouteHandler) { return this.add("GET", path, handler); }
  post(path: string, handler: RouteHandler) { return this.add("POST", path, handler); }
  put(path: string, handler: RouteHandler) { return this.add("PUT", path, handler); }
  delete(path: string, handler: RouteHandler) { return this.add("DELETE", path, handler); }
  patch(path: string, handler: RouteHandler) { return this.add("PATCH", path, handler); }
  

  private add(method: string, path: string, handler: RouteHandler) {
    if (!path.startsWith("/")) path = "/" + path;
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
    const parts = path === "/" ? [""] : path.split("/").slice(1);
    this.rawRoutes.push({ method, path, parts, handler });
    
    // Auto-add OPTIONS handler for CORS if not already defined
    if (method !== "OPTIONS" && !this.rawRoutes.some(r => r.path === path && r.method === "OPTIONS")) {
      this.rawRoutes.push({ 
        method: "OPTIONS", 
        path, 
        parts, 
        handler: () => new Response(null, { status: 204 }) 
      });
    }
    
    this.router = null;
    return this;
  }

  private isWildcard(part: string) {
    return part === "*" || part === "**";
  }

  private parseUrl(req: Request) {
    const url = new URL(req.url);
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) query[k] = v;
    return { pathname: url.pathname, query };
  }

  private async parseBody(req: Request) {
    const ct = req.headers.get("content-type") || "";

    if (ct.includes("application/json"))
      return await req.json();

    if (ct.includes("application/x-www-form-urlencoded"))
      return Object.fromEntries(new URLSearchParams(await req.text()).entries());

    if (ct.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      const files: Record<string, File> = {};
      const fields: Record<string, string> = {};
      for (const [k, v] of fd.entries()) {
        if (v instanceof File) files[k] = v;
        else fields[k] = v as string;
      }
      return { files, fields };
    }

    if (ct.startsWith("text/")) return await req.text();

    return null;
  }

  private buildRouter() {
    if (this.router) return this.router;

    const root = new TrieNode();
    
    // Sort routes by specificity for better performance
    const sortedRoutes = [...this.rawRoutes].sort((a, b) => {
      // Static routes first, then params, then wildcards
      const aHasWildcard = a.parts.some(p => this.isWildcard(p));
      const bHasWildcard = b.parts.some(p => this.isWildcard(p));
      const aHasParam = a.parts.some(p => p.startsWith(':'));
      const bHasParam = b.parts.some(p => p.startsWith(':'));
      
      if (aHasWildcard && !bHasWildcard) return 1;
      if (!aHasWildcard && bHasWildcard) return -1;
      if (aHasParam && !bHasParam) return 1;
      if (!aHasParam && bHasParam) return -1;
      return 0;
    });
    for (const r of sortedRoutes) {
      let node = root;
      if (r.parts.length === 1 && r.parts[0] === "") {
        node.handlers ??= {};
        node.handlers[r.method] = r.handler;
        continue;
      }
      for (let i = 0; i < r.parts.length; i++) {
        const part = r.parts[i];
        
        // Handle wildcards
        if (part === "*") {
          node.wildcardChild ??= new TrieNode();
          node = node.wildcardChild;
        } else if (part === "**") {
          node.catchAllChild ??= { node: new TrieNode() };
          node = node.catchAllChild.node;
        } else if (part.startsWith(":")) {
          const name = part.slice(1);
          node.paramChild ??= { name, node: new TrieNode() };
          node = node.paramChild.node;
        } else {
          node.children[part] ??= new TrieNode();
          node = node.children[part];
        }
      }
      node.handlers ??= {};
      node.handlers[r.method] = r.handler;
    }
    
    this.router = root; // Cache it
    return root;
  }

  private compilePipeline(handler: RouteHandler) {
    return async (req: PrinceRequest, params: any, query: any) => {
      // Use Object.defineProperty to bypass readonly restrictions
      Object.defineProperty(req, 'params', { value: params, writable: true, configurable: true });
      Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });

      // Parse body BEFORE middleware (so validation can access it)
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        const parsed = await this.parseBody(req);
        if (parsed && typeof parsed === "object" && "files" in parsed && "fields" in parsed) {
          Object.defineProperty(req, 'body', { value: parsed.fields, writable: true, configurable: true });
          Object.defineProperty(req, 'files', { value: parsed.files, writable: true, configurable: true });
        } else {
          Object.defineProperty(req, 'body', { value: parsed, writable: true, configurable: true });
        }
      }

      let i = 0;

      const next = async (): Promise<Response> => {
        // Run through middleware
        while (i < this.middlewares.length) {
          const result = await this.middlewares[i++](req, next);
          // If middleware returns a response, stop and use it
          if (result instanceof Response) return result;
          // Otherwise continue to next middleware (don't call next recursively)
        }

        // All middleware done, now call the handler
        const res = await handler(req);

        // Handle different response types
        if (res instanceof Response) return res;
        if (typeof res === "string") return new Response(res);
        if (res instanceof Uint8Array) return new Response(res);
        return this.json(res);
      };

      return next();
    };
  }

  async handleFetch(req: Request) {
    const url = new URL(req.url);
    const r = req as PrinceRequest;
    
    // Handle OPTIONS requests for CORS preflight BEFORE routing
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    Object.defineProperty(r, 'query', { 
      value: url.searchParams, 
      writable: true, 
      configurable: true 
    });

    const pathname = url.pathname;
    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
    const router = this.buildRouter();
    let node = router;
    let params: Record<string, string> = {};

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      
      if (node.children[seg]) {
        node = node.children[seg];
      } else if (node.paramChild) {
        params[node.paramChild.name] = seg;
        node = node.paramChild.node;
      } else if (node.wildcardChild) {
        node = node.wildcardChild;
      } else if (node.catchAllChild) {
        node = node.catchAllChild.node;
        break;
      } else {
        return this.json({ error: "Not Found" }, 404);
      }
    }

    const handler = node.handlers?.[req.method];
    if (!handler) return this.json({ error: "Method Not Allowed" }, 405);

    const pipeline = this.compilePipeline(handler);
    return pipeline(r, params, new URLSearchParams(url.search));
  }

  // Add the fetch method for testing
  async fetch(req: Request): Promise<Response> {
    try {
      return await this.handleFetch(req);
    } catch (err) {
      if (this.errorHandler) return this.errorHandler(err, req as PrinceRequest);
      if (this.devMode) {
        console.error("Error:", err);
        return this.json({ error: String(err), stack: err.stack }, 500);
      }
      return this.json({ error: "Internal Server Error" }, 500);
    }
  }

  listen(port = 3000) {
    const self = this;
    
    Bun.serve({
      port,

      fetch(req, server) {
        const { pathname } = new URL(req.url);
        const ws = self.wsRoutes[pathname];
        
        if (ws && server.upgrade(req, { data: { ws } as WSData })) {
          return;
        }

        return self.handleFetch(req as PrinceRequest).catch(err => {
          if (self.errorHandler) return self.errorHandler(err, req as PrinceRequest);
          if (self.devMode) {
            console.error("Error:", err);
            return self.json({ error: String(err), stack: err.stack }, 500);
          }
          return self.json({ error: "Internal Server Error" }, 500);
        });
      },

      websocket: {
        open(ws) { (ws.data as WSData)?.ws?.open?.(ws); },
        message(ws, msg) { (ws.data as WSData)?.ws?.message?.(ws, msg); },
        close(ws, code, reason) { (ws.data as WSData)?.ws?.close?.(ws, code, reason); },
        drain(ws) { (ws.data as WSData)?.ws?.drain?.(ws); }
      }
    });

    console.log(`🚀 PrinceJS running on http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);