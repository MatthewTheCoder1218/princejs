// prince.ts — FINAL, CLEAN, NO ERRORS
type Next = () => Promise<Response>;
type Middleware = (req: Request, next: Next) => Promise<Response> | Response;

export class Prince {
  private routes = Object.create(null) as Record<string, Record<string, (req: Request) => any>>;
  private middlewares: Middleware[] = [];

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
    this.routes[path] ??= Object.create(null);
    this.routes[path][method] = handler;
    return this;
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
          const path = url.slice(url.indexOf('/', 8));
          const route = routes[path];
          const handler = route?.[req.method] ?? route?.["GET"];

          if (!handler) {
            return this.json({ error: "Route not found" }, 404);
          }

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