type Next = () => Promise<Response | undefined>;

// FIX 1: Add middleware execution tracking
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
    // FIX 1: Check if middleware already executed
    if ((req as any)[MIDDLEWARE_EXECUTED]?.cors) {
      return await next();
    }
    
    // Mark as executed
    if (!(req as any)[MIDDLEWARE_EXECUTED]) {
      (req as any)[MIDDLEWARE_EXECUTED] = {};
    }
    (req as any)[MIDDLEWARE_EXECUTED].cors = true;

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
    if (code >= 500) return `\x1b[31m${text}\x1b[0m`;
    if (code >= 400) return `\x1b[33m${text}\x1b[0m`;
    if (code >= 300) return `\x1b[36m${text}\x1b[0m`;
    if (code >= 200) return `\x1b[32m${text}\x1b[0m`;
    return text;
  };

  return async (req: Request, next: Next) => {
    // FIX 1: Check if middleware already executed
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
}) => {
  const store = new Map<string, { count: number; resetAt: number }>();

  return async (req: Request, next: Next) => {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    const windowMs = options.window * 1000;

    let record = store.get(ip);
    
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(ip, record);
      return await next();
    }

    if (record.count >= options.max) {
      return new Response(
        JSON.stringify({ error: options.message || "Too many requests" }),
        { 
          status: 429,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    record.count++;
    return await next();
  };
};