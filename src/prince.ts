// prince.ts - Fixed router implementation
/// <reference types="bun-types" />

type Next = () => Promise<Response>;
type Middleware = (req: PrinceRequest, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;

export interface PrinceRequest extends Request {
  parsedBody?: any;
  files?: Record<string, File>;
  user?: any;
  params?: Record<string, string>;
  query?: URLSearchParams;
  [key: string]: any;
}

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
};

// SIMPLIFIED RADIX NODE - Like Hono's
interface RadixNode {
  pattern: string;
  handlers: Record<string, RouteHandler>;
  children: RadixNode[];
  paramName?: string;
  isWildcard?: boolean;
  isCatchAll?: boolean;
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
  private routeCache = new Map<string, { 
    handler: RouteHandler; 
    params: Record<string, string>;
    allowedMethods?: string[];
  }>();

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

  // ROUTING API
  get(path: string, handler: RouteHandler) { return this.add("GET", path, handler); }
  post(path: string, handler: RouteHandler) { return this.add("POST", path, handler); }
  put(path: string, handler: RouteHandler) { return this.add("PUT", path, handler); }
  delete(path: string, handler: RouteHandler) { return this.add("DELETE", path, handler); }
  patch(path: string, handler: RouteHandler) { return this.add("PATCH", path, handler); }
  options(path: string, handler: RouteHandler) { return this.add("OPTIONS", path, handler); }

  private add(method: string, path: string, handler: RouteHandler) {
    if (!path.startsWith("/")) path = "/" + path;
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
    const parts = path === "/" ? [""] : path.split("/").slice(1);
    this.rawRoutes.push({ method, path, parts, handler });
    
    // Cache static routes
    const isStaticRoute = !parts.some(part => 
      part.includes(':') || part.includes('*') || part.includes('(')
    );
    
    if (isStaticRoute) {
      const staticKey = `${method}:${path}`;
      this.staticRoutes.set(staticKey, handler);
    }
    
    this.routeCache.clear();
    this.router = null;
    return this;
  }

  // SIMPLIFIED RADIX TREE BUILDER - Like Hono
  private buildRouter(): RadixNode {
    if (this.router) return this.router;

    const root: RadixNode = {
      pattern: '',
      handlers: {},
      children: []
    };

    for (const route of this.rawRoutes) {
      if (this.staticRoutes.has(`${route.method}:${route.path}`)) {
        continue; // Skip static routes
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

      // Check existing children
      for (const child of currentNode.children) {
        if (child.pattern === part) {
          currentNode = child;
          found = true;
          break;
        }
      }

      if (!found) {
        // Create new node
        const newNode: RadixNode = {
          pattern: part,
          handlers: {},
          children: []
        };

        // Determine node type
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

    // Add handler to the final node
    currentNode.handlers[route.method] = route.handler;
  }

  // FIXED ROUTE MATCHING - Like Hono's
  private findRoute(method: string, pathname: string): { 
    handler: RouteHandler; 
    params: Record<string, string>;
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
      const result = { handler: staticHandler, params: {} };
      this.routeCache.set(cacheKey, result);
      return result;
    }

    // Check if path exists for 405 errors
    const allowedMethods = new Set<string>();
    let pathExists = false;
    
    for (const route of this.rawRoutes) {
      if (this.matchPath(route.path, pathname)) {
        pathExists = true;
        allowedMethods.add(route.method);
      }
    }

    if (!pathExists) {
      this.routeCache.set(cacheKey, null!);
      return null;
    }

    // Radix tree lookup
    const segments = pathname === "/" ? [""] : pathname.split("/").slice(1);
    const result = this.matchRoute(this.buildRouter(), segments, method);
    
    if (result) {
      this.routeCache.set(cacheKey, result);
      return result;
    }

    // Method not allowed
    if (pathExists) {
      const methodNotAllowed = { 
        handler: null as any, 
        params: {}, 
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
      // Check for catch-all
      if (routeParts.includes('**')) {
        return true;
      }
      return false;
    }

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const requestPart = requestParts[i];

      if (routePart.startsWith(':') || routePart === '*' || routePart === '**') {
        continue; // Params and wildcards match anything
      }
      
      if (routePart !== requestPart) {
        return false;
      }
    }

    return true;
  }

  private matchRoute(node: RadixNode, segments: string[], method: string, params: Record<string, string> = {}, index = 0): { handler: RouteHandler; params: Record<string, string> } | null {
    if (index === segments.length) {
      const handler = node.handlers[method];
      return handler ? { handler, params } : null;
    }

    const segment = segments[index];

    // Check static children first
    for (const child of node.children) {
      if (!child.paramName && !child.isWildcard && !child.isCatchAll) {
        if (child.pattern === segment) {
          const result = this.matchRoute(child, segments, method, params, index + 1);
          if (result) return result;
        }
      }
    }

    // Check parameter nodes
    for (const child of node.children) {
      if (child.paramName) {
        params[child.paramName] = segment;
        const result = this.matchRoute(child, segments, method, params, index + 1);
        if (result) return result;
        delete params[child.paramName];
      }
    }

    // Check wildcard nodes
    for (const child of node.children) {
      if (child.isWildcard) {
        const result = this.matchRoute(child, segments, method, params, index + 1);
        if (result) return result;
      }
    }

    // Check catch-all nodes
    for (const child of node.children) {
      if (child.isCatchAll) {
        const handler = child.handlers[method];
        if (handler) {
          return { handler, params };
        }
      }
    }

    return null;
  }

  // BODY PARSING (same as before)
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
    query: URLSearchParams
  ): Promise<Response> {
    Object.defineProperty(req, 'params', { value: params, writable: true, configurable: true });
    Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const parsed = await this.parseBody(req);
      if (parsed) {
        if (typeof parsed === "object" && "files" in parsed && "fields" in parsed) {
          Object.defineProperty(req, 'parsedBody', { value: parsed.fields, writable: true, configurable: true });
          Object.defineProperty(req, 'files', { value: parsed.files, writable: true, configurable: true });
        } else {
          Object.defineProperty(req, 'parsedBody', { value: parsed, writable: true, configurable: true });
        }
      }
    }

    Object.defineProperty(req, 'body', { 
      get: () => req.parsedBody,
      set: (value) => { req.parsedBody = value; },
      configurable: true 
    });

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
  }

  async handleFetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const r = req as PrinceRequest;
    const method = req.method;
    const pathname = url.pathname;

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

    return this.executeHandler(r, routeMatch.handler, routeMatch.params, url.searchParams);
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
      fetch: (req, server) => self.fetch(req)
    });

    console.log(`🚀 PrinceJS running on http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);