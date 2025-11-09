// prince.ts — FINAL, CLEAN, NO ERRORS
type Next = () => Promise<Response>;
type Middleware = (req: Request, next: Next) => Promise<Response> | Response;

export class Prince {
  private routes = new Map<string, Map<string, (req: Request) => any>>();
  private middlewares: Middleware[] = [];

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  error(handler: (err: any, req: Request) => Response) {
    this.use(async (req, next) => {
      try {
        return await next();
      } catch (err) {
        return handler(err, req);
      }
    });
  }

  // FIXED JSON HELPER WITH STATUS
  json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  get(path: string, handler: any) { this.add("GET", path, handler); }
  post(path: string, handler: any) { this.add("POST", path, handler); }
  put(path: string, handler: any) { this.add("PUT", path, handler); }
  delete(path: string, handler: any) { this.add("DELETE", path, handler); }
  patch(path: string, handler: any) { this.add("PATCH", path, handler); }
  options(path: string, handler: any) { this.add("OPTIONS", path, handler); }
  head(path: string, handler: any) { this.add("HEAD", path, handler); }

  private add(method: string, path: string, handler: any) {
    if (!this.routes.has(path)) this.routes.set(path, new Map());
    this.routes.get(path)!.set(method, handler);
  }

  listen(port = 3000) {
    Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);
        let index = 0;

        const next: Next = async () => {
          if (index < this.middlewares.length) {
            return await this.middlewares[index++](req, next);
          }

          const route = this.routes.get(url.pathname);
          const handler = route?.get(req.method) || route?.get("GET");
          if (!handler) {
            return this.json({ error: "Route not found" }, 404);
          }

          try {
            const result = await handler(req);
            return result instanceof Response ? result : this.json(result);
          } catch (e: any) {
            throw e;
          }
        };

        return await next();
      }
    });

    console.log(`PrinceJS v1.0.0 running at http://localhost:${port}`);
  }
}