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

// RADIX TREE NODE (REPLACES TRIE)
interface RadixNode {
  handlers: Record<string, RouteHandler> | null;
  children: Map<string, RadixNode>;
  paramChild?: { name: string; node: RadixNode };
  wildcardChild?: RadixNode;
  catchAllChild?: { name?: string; node: RadixNode };
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
  private router: RadixNode | null = null;
  private staticRoutes: Map<string, RouteHandler> = new Map();

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

  jsx(component: any, props?: any) {
    // Dynamic import to avoid circular dependencies
    const { render } = require('./jsx');
    const result = typeof component === 'function' ? component(props) : component;
    return render(result);
  }

  html(content: string) {
    return new Response(content, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
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
    
    // Cache static routes (no params, wildcards, or regex)
    const isStaticRoute = !parts.some(part => 
      part.includes(':') || part.includes('*') || part.includes('(')
    );
    
    if (isStaticRoute) {
      const staticKey = `${method}:${path}`;
      this.staticRoutes.set(staticKey, handler);
    }
    
    this.router = null;
    return this;
  }

  private findCommonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  }

  private buildRouter() {
    if (this.router) return this.router;

    const root: RadixNode = {
      handlers: null,
      children: new Map(),
    };

    // Filter out static routes
    const dynamicRoutes = this.rawRoutes.filter(route => {
      const staticKey = `${route.method}:${route.path}`;
      return !this.staticRoutes.has(staticKey);
    });

    for (const route of dynamicRoutes) {
      let node = root;
      const parts = route.parts;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // Handle special patterns
        if (part === "*") {
          node.wildcardChild ??= { handlers: null, children: new Map() };
          node = node.wildcardChild;
          continue;
        } else if (part === "**") {
          node.catchAllChild ??= { node: { handlers: null, children: new Map() } };
          node = node.catchAllChild.node;
          break;
        } else if (part.startsWith(":")) {
          const paramName = part.slice(1);
          node.paramChild ??= { name: paramName, node: { handlers: null, children: new Map() } };
          node = node.paramChild.node;
          continue;
        }

        // Radix tree: find matching child or create new
        let found = false;
        for (const [childKey, childNode] of node.children) {
          const commonPrefix = this.findCommonPrefix(part, childKey);
          if (commonPrefix.length > 0) {
            if (commonPrefix.length < childKey.length) {
              // Split the existing node
              const remaining = childKey.slice(commonPrefix.length);
              const newChild: RadixNode = {
                handlers: childNode.handlers,
                children: childNode.children,
                paramChild: childNode.paramChild,
                wildcardChild: childNode.wildcardChild,
                catchAllChild: childNode.catchAllChild,
              };
              
              node.children.delete(childKey);
              node.children.set(commonPrefix, {
                handlers: null,
                children: new Map([[remaining, newChild]]),
              });
              
              node = node.children.get(commonPrefix)!;
            } else {
              node = childNode;
            }
            found = true;
            break;
          }
        }

        if (!found) {
          node.children.set(part, { handlers: null, children: new Map() });
          node = node.children.get(part)!;
        }
      }

      // Set handler for this route
      node.handlers ??= {};
      node.handlers[route.method] = route.handler;
    }

    this.router = root;
    return root;
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

  private compilePipeline(handler: RouteHandler) {
    return async (req: PrinceRequest, params: any, query: any) => {
      Object.defineProperty(req, 'params', { value: params, writable: true, configurable: true });
      Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });

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
        while (i < this.middlewares.length) {
          const result = await this.middlewares[i++](req, next);
          if (result instanceof Response) return result;
        }

        const res = await handler(req);

        if (res instanceof Response) return res;
        if (typeof res === "string") return new Response(res);
        if (res instanceof Uint8Array) return new Response(res);
        return this.json(res);
      };

      return next();
    };
  }

  private async executeHandler(
    req: PrinceRequest, 
    handler: RouteHandler, 
    params: Record<string, string>, 
    query: URLSearchParams
  ) {
    Object.defineProperty(req, 'params', { value: params, writable: true, configurable: true });
    Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const parsed = await this.parseBody(req);
      if (parsed) {
        if (typeof parsed === "object" && "files" in parsed && "fields" in parsed) {
          Object.defineProperty(req, 'body', { value: parsed.fields, writable: true, configurable: true });
          Object.defineProperty(req, 'files', { value: parsed.files, writable: true, configurable: true });
        } else {
          Object.defineProperty(req, 'body', { value: parsed, writable: true, configurable: true });
        }
      }
    }

    return this.compilePipeline(handler)(req, params, query);
  }

  async handleFetch(req: Request) {
    const url = new URL(req.url);
    const r = req as PrinceRequest;
    const method = req.method;
    const pathname = url.pathname;

    // Static route fast path
    const staticKey = `${method}:${pathname}`;
    const staticHandler = this.staticRoutes.get(staticKey);
    if (staticHandler) {
      return this.executeHandler(r, staticHandler, {}, url.searchParams);
    }

    // Radix tree lookup for dynamic routes
    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
    const router = this.buildRouter();
    let node = router;
    let params: Record<string, string> = {};

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let found = false;

      // Try exact match first
      if (node.children.has(seg)) {
        node = node.children.get(seg)!;
        found = true;
      } else {
        // Try prefix matching (Radix tree advantage)
        for (const [childKey, childNode] of node.children) {
          if (seg.startsWith(childKey)) {
            node = childNode;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        if (node.paramChild) {
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
    }

    const handler = node.handlers?.[method];
    if (!handler) return this.json({ error: "Method Not Allowed" }, 405);

    return this.executeHandler(r, handler, params, url.searchParams);
  }

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