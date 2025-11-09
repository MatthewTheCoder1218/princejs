// @bun
// prince.ts
class Prince {
  routes = new Map;
  middlewares = [];
  use(middleware) {
    this.middlewares.push(middleware);
  }
  error(handler) {
    this.use(async (req, next) => {
      try {
        return await next();
      } catch (err) {
        return handler(err, req);
      }
    });
  }
  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }
  get(path, handler) {
    this.add("GET", path, handler);
  }
  post(path, handler) {
    this.add("POST", path, handler);
  }
  put(path, handler) {
    this.add("PUT", path, handler);
  }
  delete(path, handler) {
    this.add("DELETE", path, handler);
  }
  patch(path, handler) {
    this.add("PATCH", path, handler);
  }
  options(path, handler) {
    this.add("OPTIONS", path, handler);
  }
  head(path, handler) {
    this.add("HEAD", path, handler);
  }
  add(method, path, handler) {
    if (!this.routes.has(path))
      this.routes.set(path, new Map);
    this.routes.get(path).set(method, handler);
  }
  listen(port = 3000) {
    Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);
        let index = 0;
        const next = async () => {
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
          } catch (e) {
            throw e;
          }
        };
        return await next();
      }
    });
    console.log(`PrinceJS v1.0.0 running at http://localhost:${port}`);
  }
}
export {
  Prince
};
