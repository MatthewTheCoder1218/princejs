type Next = () => Promise<Response>;
type Middleware = (req: Request, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;
type RouteHandler = (req: Request, params: Record<string,string>) => Promise<HandlerResult> | HandlerResult;

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

export class Prince {
  private rawRoutes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];
  private errorHandler?: (err: any, req: Request) => Response;

  constructor(private devMode = false) {}

  use(mw: Middleware) { this.middlewares.push(mw); return this; }
  error(fn: (err: any, req: Request) => Response) { this.errorHandler = fn; return this; }

  json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
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

  private buildRouter() {
    const root = new TrieNode();
    for (const route of this.rawRoutes) {
      let node = root;
      const parts = route.parts;
      
      // Handle root route specially
      if (parts.length === 1 && parts[0] === "") {
        if (!node.handlers) node.handlers = Object.create(null);
        node.handlers[route.method] = route.handler;
        continue;
      }
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "**") {
          node.catchAllChild ??= { node: new TrieNode() };
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

  private compilePipeline(handler: RouteHandler, paramsFromMatch: (req: Request)=>Record<string,string>) {
    const mws = this.middlewares.slice();
    return async (req: Request) => {
      let idx = 0;
      const runNext = async (): Promise<Response | undefined> => {
        if (idx >= mws.length) {
          const params = paramsFromMatch(req);
          const res = await handler(req, params);
          if (res instanceof Response) return res;
          if (typeof res === "string") return new Response(res, { status: 200 });
          if (res instanceof Uint8Array || res instanceof ArrayBuffer) return new Response(res as any, { status: 200 });
          return this.json(res);
        }
        const mw = mws[idx++];
        const maybe = await mw(req, runNext);
        return maybe;
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
    const handlerMap = new Map<TrieNode, Record<string, (req: Request)=>Promise<Response>>>();

    Bun.serve({
      port,
      fetch: async (req: Request) => {
        try {
          const pathname = this.fastPathname(req);
          const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
          let node: TrieNode | undefined = root;
          const params: Record<string,string> = Object.create(null);
          let matched = true;

          // Handle root path specially
          if (segments.length === 0) {
            if (!node.handlers) return this.json({ error: "Route not found" }, 404);
            const handler = node.handlers[req.method];
            if (!handler) return this.json({ error: "Method not allowed" }, 405);

            let methodMap = handlerMap.get(node);
            if (!methodMap) { 
              methodMap = Object.create(null); 
              handlerMap.set(node, methodMap); 
            }
            
            if (!methodMap[req.method]) {
              methodMap[req.method] = this.compilePipeline(handler, (_) => params);
            }

            return await methodMap[req.method](req);
          }

          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (!node) { matched = false; break; }
            if (node.children[seg]) { node = node.children[seg]; continue; }
            if (node.paramChild) { params[node.paramChild.name] = seg; node = node.paramChild.node; continue; }
            if (node.wildcardChild) { node = node.wildcardChild; continue; }
            if (node.catchAllChild) {
              const remaining = segments.slice(i).join("/");
              if (node.catchAllChild.name) params[node.catchAllChild.name] = remaining;
              node = node.catchAllChild.node;
              i = segments.length;
              break;
            }
            matched = false;
            break;
          }

          if (!matched || !node || !node.handlers) return this.json({ error: "Route not found" }, 404);
          const byMethod = node.handlers;
          const handler = byMethod[req.method] ?? byMethod["GET"];
          if (!handler) return this.json({ error: "Method not allowed" }, 405);

          // Lazily compile and cache the pipeline for this method
          let methodMap = handlerMap.get(node);
          if (!methodMap) { 
            methodMap = Object.create(null); 
            handlerMap.set(node, methodMap); 
          }
          
          if (!methodMap[req.method]) {
            methodMap[req.method] = this.compilePipeline(handler, (_) => params);
          }

          return await methodMap[req.method](req);
        } catch (err) {
          if (this.errorHandler) {
            try { return this.errorHandler(err, req); } catch {}
          }
          return this.json({ error: String(err) }, 500);
        }
      }
    });

    console.log(`PrinceJS v2 running at http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);