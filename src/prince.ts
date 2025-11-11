type Next = () => Promise<Response>;
type Middleware = (req: Request, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;

interface PrinceRequest extends Request {
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  headers: Headers;
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

  status(code: number) { this._status = code; return this; }
  header(key: string, value: string) { this._headers[key] = value; return this; }
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
    return new Response(this._body, {
      status: this._status,
      headers: this._headers
    });
  }
}

export class Prince {
  private rawRoutes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];
  private errorHandler?: (err: any, req: Request) => Response;
  private prefix = "";

  constructor(private devMode = false) {}

  use(mw: Middleware) { this.middlewares.push(mw); return this; }
  error(fn: (err: any, req: Request) => Response) { this.errorHandler = fn; return this; }

  json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  response() { return new ResponseBuilder(); }

  route(path: string) {
    const group = new Prince(this.devMode);
    group.prefix = path;
    group.middlewares = [...this.middlewares];
    return {
      get: (subpath: string, handler: RouteHandler) => {
        this.get(path + subpath, handler);
        return group;
      },
      post: (subpath: string, handler: RouteHandler) => {
        this.post(path + subpath, handler);
        return group;
      },
      put: (subpath: string, handler: RouteHandler) => {
        this.put(path + subpath, handler);
        return group;
      },
      delete: (subpath: string, handler: RouteHandler) => {
        this.delete(path + subpath, handler);
        return group;
      },
      patch: (subpath: string, handler: RouteHandler) => {
        this.patch(path + subpath, handler);
        return group;
      }
    };
  }

  get(path: string, handler: RouteHandler) { return this.add("GET", path, handler); }
  post(path: string, handler: RouteHandler) { return this.add("POST", path, handler); }
  put(path: string, handler: RouteHandler) { return this.add("PUT", path, handler); }
  delete(path: string, handler: RouteHandler) { return this.add("DELETE", path, handler); }
  patch(path: string, handler: RouteHandler) { return this.add("PATCH", path, handler); }
  options(path: string, handler: RouteHandler) { return this.add("OPTIONS", path, handler); }
  head(path: string, handler: RouteHandler) { return this.add("HEAD", path, handler); }

  private add(method: string, path: string, handler: RouteHandler) {
    if (!path.startsWith("/")) path = "/" + path;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const parts = path === "/" ? [""] : path.split("/").slice(1);
    this.rawRoutes.push({ method: method.toUpperCase(), path, parts, handler });
    return this;
  }

  private fastPathname(req: Request) {
    const u = req.url;
    const protoSep = u.indexOf("://");
    const start = protoSep !== -1 ? u.indexOf("/", protoSep + 3) : u.indexOf("/");
    if (start === -1) return "/";
    const q = u.indexOf("?", start);
    const h = u.indexOf("#", start);
    const end = q !== -1 ? q : (h !== -1 ? h : u.length);
    return u.slice(start, end);
  }

  private parseQuery(url: string): Record<string, string> {
    const q = url.indexOf("?");
    if (q === -1) return {};
    
    const query: Record<string, string> = {};
    const search = url.slice(q + 1);
    const pairs = search.split("&");
    
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const eq = pair.indexOf("=");
      if (eq === -1) {
        query[decodeURIComponent(pair)] = "";
      } else {
        query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
    }
    return query;
  }

  private async parseBody(req: Request): Promise<any> {
    const ct = req.headers.get("content-type") || "";
    
    if (ct.includes("application/json")) {
      return await req.json();
    }
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params: Record<string, string> = {};
      const pairs = text.split("&");
      for (const pair of pairs) {
        const [key, val] = pair.split("=");
        params[decodeURIComponent(key)] = decodeURIComponent(val || "");
      }
      return params;
    }
    if (ct.includes("text/")) {
      return await req.text();
    }
    return null;
  }

  private buildRouter() {
    const root = new TrieNode();
    for (const route of this.rawRoutes) {
      let node = root;
      const parts = route.parts;
      
      if (parts.length === 1 && parts[0] === "") {
        if (!node.handlers) node.handlers = Object.create(null);
        node.handlers[route.method] = route.handler;
        continue;
      }
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "**") {
          // FIX 2: Properly assign name to catchAllChild
          if (!node.catchAllChild) {
            node.catchAllChild = { name: "**", node: new TrieNode() };
          }
          node = node.catchAllChild.node;
          break;
        } else if (part === "*") {
          if (!node.wildcardChild) node.wildcardChild = new TrieNode();
          node = node.wildcardChild;
        } else if (part.startsWith(":")) {
          const name = part.slice(1);
          if (!node.paramChild) node.paramChild = { name, node: new TrieNode() };
          node = node.paramChild.node;
        } else {
          if (!node.children[part]) node.children[part] = new TrieNode();
          node = node.children[part];
        }
      }
      if (!node.handlers) node.handlers = Object.create(null);
      node.handlers[route.method] = route.handler;
    }
    return root;
  }

  private compilePipeline(handler: RouteHandler, paramsGetter: (req: Request) => Record<string, string>) {
    const mws = this.middlewares.slice();
    const hasMiddleware = mws.length > 0;
    
    if (!hasMiddleware) {
      return async (req: Request, params: Record<string, string>, query: Record<string, string>) => {
        const princeReq = req as PrinceRequest;
        princeReq.params = params;
        princeReq.query = query;
        
        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
          princeReq.body = await this.parseBody(req);
        }
        
        const res = await handler(princeReq);
        if (res instanceof Response) return res;
        if (typeof res === "string") return new Response(res, { status: 200 });
        if (res instanceof Uint8Array || res instanceof ArrayBuffer) return new Response(res as any, { status: 200 });
        return this.json(res);
      };
    }
    
    return async (req: Request, params: Record<string, string>, query: Record<string, string>) => {
      const princeReq = req as PrinceRequest;
      princeReq.params = params;
      princeReq.query = query;
      
      let idx = 0;
      const runNext = async (): Promise<Response | undefined> => {
        if (idx >= mws.length) {
          if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
            princeReq.body = await this.parseBody(req);
          }
          
          const res = await handler(princeReq);
          if (res instanceof Response) return res;
          if (typeof res === "string") return new Response(res, { status: 200 });
          if (res instanceof Uint8Array || res instanceof ArrayBuffer) return new Response(res as any, { status: 200 });
          return this.json(res);
        }
        const mw = mws[idx++];
        return await mw(req, runNext);
      };
      
      const out = await runNext();
      if (out instanceof Response) return out;
      if (out !== undefined) {
        if (typeof out === "string") return new Response(out, { status: 200 });
        if (out instanceof Uint8Array || out instanceof ArrayBuffer) return new Response(out as any, { status: 200 });
        return this.json(out);
      }
      return new Response(null, { status: 204 });
    };
  }

  listen(port = 3000) {
    const root = this.buildRouter();
    const handlerMap = new Map<TrieNode, Record<string, any>>();

    Bun.serve({
      port,
      fetch: async (req: Request) => {
        try {
          const pathname = this.fastPathname(req);
          const query = this.parseQuery(req.url);
          const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
          let node: TrieNode | undefined = root;
          const params: Record<string, string> = {};
          let matched = true;

          if (segments.length === 0) {
            if (!node.handlers) return this.json({ error: "Route not found" }, 404);
            const handler = node.handlers[req.method];
            if (!handler) return this.json({ error: "Method not allowed" }, 405);

            let methodMap = handlerMap.get(node);
            if (!methodMap) { 
              methodMap = {};
              handlerMap.set(node, methodMap); 
            }
            
            if (!methodMap[req.method]) {
              methodMap[req.method] = this.compilePipeline(handler, (_) => params);
            }

            return await methodMap[req.method](req, params, query);
          }

          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (node.children[seg]) { node = node.children[seg]; continue; }
            if (node.paramChild) { params[node.paramChild.name] = seg; node = node.paramChild.node; continue; }
            if (node.wildcardChild) { node = node.wildcardChild; continue; }
            if (node.catchAllChild) {
              const remaining = segments.slice(i).join("/");
              if (node.catchAllChild.name) params[node.catchAllChild.name] = remaining;
              node = node.catchAllChild.node;
              break;
            }
            // No match found
            matched = false;
            break;
          }

          // FIX 3: Check !node after the loop
          if (!matched || !node || !node.handlers) return this.json({ error: "Route not found" }, 404);
          const handler = node.handlers[req.method];
          if (!handler) return this.json({ error: "Method not allowed" }, 405);

          let methodMap = handlerMap.get(node);
          if (!methodMap) { 
            methodMap = {};
            handlerMap.set(node, methodMap); 
          }
          
          if (!methodMap[req.method]) {
            methodMap[req.method] = this.compilePipeline(handler, (_) => params);
          }

          return await methodMap[req.method](req, params, query);
        } catch (err) {
          if (this.errorHandler) {
            try { return this.errorHandler(err, req); } catch {}
          }
          return this.json({ error: String(err) }, 500);
        }
      }
    });

    console.log(`🚀 PrinceJS running at http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);