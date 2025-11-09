// prince.ts — FINAL, CLEAN, NO ERRORS
type Next = () => Promise<Response>;
type Middleware = (req: Request, next: Next) => Promise<Response> | Response;

export class Prince {
  private routes = Object.create(null) as Record<string, Record<string, (req: Request) => any>>;
  private middlewares: Middleware[] = [];

  // added: minimal dynamic route store for params
  private dynamicRoutes: { segments: string[]; methods: Record<string, (req: Request) => any> }[] = [];

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  error(handler: (err: any, req: Request) => Response) {
    this.use(async (req, next) => {
      try {
        return await next();
      } catch (err) {
        return handler(err, req);
      }
    });
    return this;
  }

  json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  get(path: string, handler: any) { return this.add("GET", path, handler); }
  post(path: string, handler: any) { return this.add("POST", path, handler); }
  put(path: string, handler: any) { return this.add("PUT", path, handler); }
  delete(path: string, handler: any) { return this.add("DELETE", path, handler); }
  patch(path: string, handler: any) { return this.add("PATCH", path, handler); }
  options(path: string, handler: any) { return this.add("OPTIONS", path, handler); }
  head(path: string, handler: any) { return this.add("HEAD", path, handler); }

  private add(method: string, path: string, handler: any) {
    // if dynamic (contains :), register in dynamicRoutes
    if (path.indexOf(':') !== -1) {
      const segments = path.split('/').filter(Boolean);
      // try to reuse existing pattern entry
      for (let i = 0; i < this.dynamicRoutes.length; i++) {
        const r = this.dynamicRoutes[i];
        if (r.segments.length === segments.length && r.segments.every((s, idx) => s === segments[idx])) {
          r.methods[method] = handler;
          return this;
        }
      }
      this.dynamicRoutes.push({ segments, methods: { [method]: handler } });
      return this;
    }

    this.routes[path] ??= Object.create(null);
    this.routes[path][method] = handler;
    return this;
  }

  // new helper: find handler and params (static first, then dynamic)
  private findHandler(path: string, method: string): { handler?: any; params: Record<string,string> } {
    // static exact match
    const staticRoute = this.routes[path];
    const staticHandler = staticRoute?.[method] ?? staticRoute?.["GET"];
    if (staticHandler) return { handler: staticHandler, params: Object.create(null) };

    // dynamic routes
    const reqSegs = path.split('/').filter(Boolean);
    for (let i = 0; i < this.dynamicRoutes.length; i++) {
      const r = this.dynamicRoutes[i];
      if (r.segments.length !== reqSegs.length) continue;
      const params: Record<string,string> = Object.create(null);
      let ok = true;
      for (let j = 0; j < r.segments.length; j++) {
        const seg = r.segments[j];
        const reqSeg = reqSegs[j];
        if (!reqSeg) { ok = false; break; }
        if (seg[0] === ':') {
          try {
            params[seg.slice(1)] = decodeURIComponent(reqSeg);
          } catch {
            params[seg.slice(1)] = reqSeg;
          }
        } else if (seg !== reqSeg) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const h = r.methods[method] ?? r.methods["GET"];
      if (h) return { handler: h, params };
    }

    return { handler: undefined, params: Object.create(null) };
  }

  listen(port = 3000) {
    const mw = this.middlewares;
    const mwLen = mw.length;
    const routes = this.routes;

    return Bun.serve({
      port,
      fetch: async (req) => {
        try {
          const url = req.url;
          // fast path extraction
          const pathStart = url.indexOf('/', 8);
          const pathEnd = url.indexOf('?', pathStart);
          const path = pathStart === -1 ? '/' : (pathEnd === -1 ? url.slice(pathStart) : url.slice(pathStart, pathEnd));

          // use new finder
          const { handler, params } = this.findHandler(path, req.method);

          if (!handler) {
            return this.json({ error: "Route not found" }, 404);
          }

          // attach params
          (req as any).params = params;

          if (!mwLen) {
            const result = await handler(req);
            return result instanceof Response ? result : this.json(result);
          }

          let idx = 0;
          const next = async () => {
            if (idx < mwLen) return mw[idx++](req, next);
            const result = await handler(req);
            return result instanceof Response ? result : this.json(result);
          };
          return next();

        } catch (err) {
          return this.json({ error: String(err) }, 500);
        }
      }
    });
  }
}

export const prince = () => new Prince();