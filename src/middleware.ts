type Next = () => Promise<Response | undefined>;

// Middleware execution tracking
const MIDDLEWARE_EXECUTED = Symbol("middlewareExecuted");

export const cors = (options?: {
  origin?: string;
  methods?: string;
  headers?: string;
  credentials?: boolean;
}) => {
  const origin = options?.origin || "*";
  const methods = options?.methods || "GET,POST,PUT,DELETE,PATCH,OPTIONS";
  const headers = options?.headers || "Content-Type,Authorization";
  const credentials = options?.credentials || false;

  return async (req: Request, next: Next) => {
    // Check if middleware already executed
    if ((req as any)[MIDDLEWARE_EXECUTED]?.cors) {
      return await next();
    }
    
    // Mark as executed
    if (!(req as any)[MIDDLEWARE_EXECUTED]) {
      (req as any)[MIDDLEWARE_EXECUTED] = {};
    }
    (req as any)[MIDDLEWARE_EXECUTED].cors = true;

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": methods,
          "Access-Control-Allow-Headers": headers,
          ...(credentials ? { "Access-Control-Allow-Credentials": "true" } : {})
        }
      });
    }

    const res = await next();
    if (!res) return res;

    const newHeaders = new Headers(res.headers);
    newHeaders.set("Access-Control-Allow-Origin", origin);
    if (credentials) newHeaders.set("Access-Control-Allow-Credentials", "true");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders
    });
  };
};

export const logger = (options?: {
  format?: "dev" | "combined" | "tiny";
  colors?: boolean;
}) => {
  const format = options?.format || "dev";
  const colors = options?.colors !== false;

  const colorize = (code: number, text: string) => {
    if (!colors) return text;
    if (code >= 500) return `\x1b[31m${text}\x1b[0m`; // Red
    if (code >= 400) return `\x1b[33m${text}\x1b[0m`; // Yellow
    if (code >= 300) return `\x1b[36m${text}\x1b[0m`; // Cyan
    if (code >= 200) return `\x1b[32m${text}\x1b[0m`; // Green
    return text;
  };

  return async (req: Request, next: Next) => {
    // Check if middleware already executed
    if ((req as any)[MIDDLEWARE_EXECUTED]?.logger) {
      return await next();
    }
    
    if (!(req as any)[MIDDLEWARE_EXECUTED]) {
      (req as any)[MIDDLEWARE_EXECUTED] = {};
    }
    (req as any)[MIDDLEWARE_EXECUTED].logger = true;

    const start = Date.now();
    const pathname = new URL(req.url).pathname;
    
    const res = await next();
    if (!res) return res;

    const duration = Date.now() - start;
    const status = res.status;

    if (format === "dev") {
      console.log(
        `${colorize(status, req.method)} ${pathname} ${colorize(status, String(status))} ${duration}ms`
      );
    } else if (format === "tiny") {
      console.log(`${req.method} ${pathname} ${status} - ${duration}ms`);
    } else {
      const date = new Date().toISOString();
      console.log(`[${date}] ${req.method} ${pathname} ${status} ${duration}ms`);
    }

    return res;
  };
};

export const rateLimit = (options: {
  max: number;
  window: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) => {
  const store = new Map<string, { count: number; resetAt: number }>();

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }, options.window * 1000);

  return async (req: Request, next: Next) => {
    // Check if middleware already executed
    if ((req as any)[MIDDLEWARE_EXECUTED]?.rateLimit) {
      return await next();
    }
    
    if (!(req as any)[MIDDLEWARE_EXECUTED]) {
      (req as any)[MIDDLEWARE_EXECUTED] = {};
    }
    (req as any)[MIDDLEWARE_EXECUTED].rateLimit = true;

    const key = options.keyGenerator 
      ? options.keyGenerator(req)
      : req.headers.get("x-forwarded-for") || 
        req.headers.get("x-real-ip") || 
        "unknown";
    
    const now = Date.now();
    const windowMs = options.window * 1000;

    let record = store.get(key);
    
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(key, record);
      return await next();
    }

    if (record.count >= options.max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return new Response(
        JSON.stringify({ 
          error: options.message || "Too many requests",
          retryAfter
        }),
        { 
          status: 429,
          headers: { 
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter)
          }
        }
      );
    }

    record.count++;
    return await next();
  };
};

// Static file serving middleware
export const serve = (options: {
  root: string;
  index?: string;
  dotfiles?: "allow" | "deny";
}) => {
  const root = options.root || "./public";
  const index = options.index || "index.html";
  const dotfiles = options.dotfiles || "deny";

  return async (req: Request, next: Next) => {
    const url = new URL(req.url);
    let filepath = url.pathname;

    // Security: prevent directory traversal
    if (filepath.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Handle dotfiles
    if (dotfiles === "deny" && filepath.split("/").some(part => part.startsWith("."))) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const file = Bun.file(`${root}${filepath}`);
      
      if (await file.exists()) {
        return new Response(file);
      }

      // Try index file if directory
      const indexFile = Bun.file(`${root}${filepath}/${index}`);
      if (await indexFile.exists()) {
        return new Response(indexFile);
      }
    } catch (err) {
      // File doesn't exist, continue to next middleware
    }

    return await next();
  };
};