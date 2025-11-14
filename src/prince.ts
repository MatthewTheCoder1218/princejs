type Next = () => Promise<Response>;
type Middleware = (req: PrinceRequest, next: Next) => Promise<Response | undefined> | Response | undefined;
type HandlerResult = Response | Record<string, any> | string | Uint8Array;

export interface PrinceRequest extends Request {
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
  private wsRoutes: Record<string, any> = {};
  private openapiData: any = null;

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
    return this;
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
    const root = new TrieNode();
    for (const r of this.rawRoutes) {
      let node = root;
      if (r.parts.length === 1 && r.parts[0] === "") {
        node.handlers ??= {};
        node.handlers[r.method] = r.handler;
        continue;
      }
      for (const part of r.parts) {
        if (part.startsWith(":")) {
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
    return root;
  }

  private compilePipeline(handler: RouteHandler) {
    return async (req: PrinceRequest, params: any, query: any) => {
      req.params = params;
      req.query = query;

      let i = 0;

      const next = async (): Promise<Response> => {
        if (i < this.middlewares.length) {
          return (await this.middlewares[i++](req, next)) ?? new Response("");
        }

        if (["POST", "PUT", "PATCH"].includes(req.method))
          req.body = await this.parseBody(req);

        const res = await handler(req);

        if (res instanceof Response) return res;
        if (typeof res === "string") return new Response(res);
        return this.json(res);
      };

      return next();
    };
  }

  async handleFetch(req: Request) {
    const { pathname, query } = this.parseUrl(req);
    const r = req as PrinceRequest;

    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
    let node = this.buildRouter();
    let params: Record<string, string> = {};

    for (const seg of segments) {
      if (node.children[seg]) node = node.children[seg];
      else if (node.paramChild) {
        params[node.paramChild.name] = seg;
        node = node.paramChild.node;
      } else return this.json({ error: "Not Found" }, 404);
    }

    const handler = node.handlers?.[req.method];
    if (!handler) return this.json({ error: "Method Not Allowed" }, 405);

    const pipeline = this.compilePipeline(handler);
    return pipeline(r, params, query);
  }

  listen(port = 3000) {
    const self = this;
    Bun.serve({
      port,

      fetch(req, server) {
        const { pathname } = new URL(req.url);
        const ws = self.wsRoutes[pathname];
        if (ws) {
          server.upgrade(req, { data: { ws } });
          return;
        }

        return self.handleFetch(req as PrinceRequest).catch(err => {
          if (self.errorHandler) return self.errorHandler(err, req as PrinceRequest);
          return self.json({ error: String(err) }, 500);
        });
      },

      websocket: {
        open(ws) { ws.data.ws?.open?.(ws); },
        message(ws, msg) { ws.data.ws?.message?.(ws, msg); },
        close(ws) { ws.data.ws?.close?.(ws); }
      }
    });

    console.log(`🚀 PrinceJS running http://localhost:${port}`);
  }
}

export const prince = (dev = false) => new Prince(dev);
