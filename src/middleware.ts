// princejs/middleware.ts
// @ts-nocheck 
import type { PrinceRequest } from "./prince";
import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";

type Next = () => Promise<Response | undefined>;
type HandlerReturn = Response | { [key: string]: any } | undefined;

export interface LoggerOptions {
  enabled?: boolean;
  errorsOnly?: boolean;      // 👈 NEW
  logHeaders?: boolean;
  logBody?: boolean;
  formatter?: (data: {
    req: PrinceRequest;
    res?: Response;
    duration: number;
    error?: any;
  }) => void;
}

export const logger = (options: LoggerOptions = {}) => {
  const {
    enabled = true,
    errorsOnly = false,
    logHeaders = false,
    logBody = false,
    formatter
  } = options;

  return async (req: PrinceRequest, next: Next) => {
    if (!enabled) return next();

    const start = Date.now();

    try {
      const res = await next();
      const duration = Date.now() - start;

      // 👇 Skip logging unless it's an error
      if (errorsOnly && res.status < 400) {
        return res;
      }

      if (formatter) {
        formatter({ req, res, duration });
        return res;
      }

      const log: any = {
        method: req.method,
        path: new URL(req.url).pathname,
        status: res.status,
        duration: `${duration}ms`
      };

      if (logHeaders) {
        log.headers = Object.fromEntries(req.headers.entries());
      }

      if (logBody && req.body) {
        log.body = req.body;
      }

      console.log(log);
      return res;
    } catch (error) {
      const duration = Date.now() - start;

      if (formatter) {
        formatter({ req, duration, error });
      } else {
        console.error({
          method: req.method,
          path: new URL(req.url).pathname,
          error: String(error),
          duration: `${duration}ms`
        });
      }

      throw error;
    }
  };
};

// === CORS ===
// 🔒 FIXED: Default to strict mode instead of '*' for better security
export const cors = (origin: string = 'http://localhost:3000') => {
  return async (req: any, next: Function) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    const response = await next();
    
    // Add CORS headers to actual response
    if (response) {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    
    return response;
  };
};

// === JWT ===
// 🔒 FIXED: Added algorithm parameter and improved error handling
export const signJWT = async (payload: any, secret: Uint8Array, expiresIn: string, alg: string = 'HS256') => {
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
  
  return jwt;
};

export const jwt = (key: Uint8Array, options?: { algorithms?: string[] }) => {
  const algorithms = options?.algorithms ?? ["HS256", "HS512"];
  return async (req: PrinceRequest, next: Next) => {
    const auth = req.headers.get("authorization");
    
    req.user = undefined;

    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();

      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: algorithms as any,
        });
        
        req.user = payload; 
        
      } catch (err) {
        // 🔒 FIXED: Log error type but don't expose details to client
        console.error("JWT Verification Failed: Invalid token");
      }
    }
    
    const result = await next();
    return result;
  };
};

// === RATE LIMIT ===
// 🚀 PERFORMANCE: Improved cleanup logic and better memory management
export const rateLimit = (max: number, window = 60) => {
  const store: Record<string, number> = {};
  let lastCleanup = Date.now();
  
  return async (req: PrinceRequest, next: Next) => {
    const ip = req.ip || "127.0.0.1";
    const bucket = Math.floor(Date.now() / (window * 1000));
    const key = `${ip}:${bucket}`;
    
    store[key] = (store[key] || 0) + 1;
    
    if (store[key] > max) {
      return new Response(
        JSON.stringify({ 
          error: "Too many requests", 
          retryAfter: window 
        }), 
        { 
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(window)
          }
        }
      );
    }
    
    // 🚀 Cleanup old entries every 10 seconds instead of random
    if (Date.now() - lastCleanup > 10000) {
      lastCleanup = Date.now();
      const currentBucket = Math.floor(Date.now() / (window * 1000));
      Object.keys(store).forEach(k => {
        const [_, b] = k.split(":");
        if (currentBucket - parseInt(b) > 2) delete store[k];
      });
    }
    
    return next();
  };
};

// === VALIDATE ===
export const validate = (schema: z.ZodSchema) => {
  return async (req: any, next: Function) => {
    let bodyData = req.parsedBody;
    
    // Mark that we've attempted to parse the body (even if validation fails)
    let bodyParsed = false;
    
    // If parsedBody is not set, parse it now
    if (!bodyData && ["POST", "PUT", "PATCH"].includes(req.method)) {
      const ct = req.headers.get("content-type") || "";
      
      if (ct.includes("application/json")) {
        try {
          const clonedReq = req.clone();
          const text = await clonedReq.text();
          if (text) {
            bodyData = JSON.parse(text);
            bodyParsed = true;
          }
        } catch (parseError) {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        try {
          const clonedReq = req.clone();
          const text = await clonedReq.text();
          bodyData = Object.fromEntries(new URLSearchParams(text));
          bodyParsed = true;
        } catch (parseError) {
          return new Response(
            JSON.stringify({ error: 'Invalid form data' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }
    
    // Validate the body data
    if (bodyData) {
      const result = schema.safeParse(bodyData);
      
      if (!result.success) {
        // Set a flag to prevent double parsing even though validation failed
        if (bodyParsed) {
          req.parsedBody = bodyData; // Set the invalid data to prevent re-parsing
        }
        return new Response(
          JSON.stringify({ 
            error: 'Validation failed', 
            details: result.error.issues.map(e => ({
              path: e.path.join('.'),
              message: e.message
            }))
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      req.parsedBody = result.data;
      Object.defineProperty(req, 'body', { 
        value: result.data,
        writable: true,
        configurable: true 
      });
    }
    
    return next();
  };
};

// === AUTH GUARD ===
export const auth = (options?: { roles?: string[] }) => {
  return async (req: PrinceRequest, next: Next) => {
    if (!req.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (options?.roles) {
      const userRole = req.user.role || req.user.roles;
      const hasRole = Array.isArray(userRole) 
        ? options.roles.some(r => userRole.includes(r))
        : options.roles.includes(userRole);
        
      if (!hasRole) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    
    return next();
  };
};

// === API KEY ===
export const apiKey = (options: { keys: string[]; header?: string }) => {
  const keySet = new Set(options.keys);
  const headerName = (options.header || "x-api-key").toLowerCase();
  
  return async (req: PrinceRequest, next: Next) => {
    const key = req.headers.get(headerName);
    
    if (!key || !keySet.has(key)) {
      return new Response(
        JSON.stringify({ error: "Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    req.apiKey = key;
    return next();
  };
};

// === COMPRESSION ===
export const compress = (options?: { 
  threshold?: number; 
  filter?: (req: PrinceRequest) => boolean;
}) => {
  const threshold = options?.threshold || 1024;
  const filter = options?.filter || (() => true);
  
  return async (req: PrinceRequest, next: Next) => {
    const response = await next();
    if (!response || !filter(req)) return response;
    
    const contentType = response.headers.get("content-type") || "";
    
    if (!contentType.includes("json") && 
        !contentType.includes("text") && 
        !contentType.includes("javascript") &&
        !contentType.includes("xml")) {
      return response;
    }
    
    const acceptEncoding = req.headers.get("accept-encoding") || "";
    
    if (!acceptEncoding.includes("gzip") && !acceptEncoding.includes("br")) {
      return response;
    }
    
    const body = await response.text();
    
    if (body.length < threshold) {
      return new Response(body, response);
    }
    
    const compressed = Bun.gzipSync(new TextEncoder().encode(body));
    
    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", "gzip");
    headers.set("Content-Length", String(compressed.length));
    
    return new Response(compressed, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
};

// === SESSION ===
export const session = (options: { 
  secret: string; 
  maxAge?: number; 
  name?: string;
}) => {
  const sessions = new Map<string, any>();
  const cookieName = options.name || "prince.sid";
  const maxAge = options.maxAge || 3600;
  
  setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessions.entries()) {
      if (data._expires && data._expires < now) {
        sessions.delete(id);
      }
    }
  }, 300_000);
  
  return async (req: PrinceRequest, next: Next) => {
    const cookies = req.headers.get("cookie");
    let sessionId: string | undefined;
    
    if (cookies) {
      const match = cookies.match(new RegExp(`${cookieName}=([^;]+)`));
      sessionId = match?.[1];
    }
    
    if (sessionId && sessions.has(sessionId)) {
      req.session = sessions.get(sessionId);
    } else {
      sessionId = crypto.randomUUID();
      req.session = { _expires: Date.now() + maxAge * 1000 };
    }
    
    // Track if session was destroyed
    let sessionDestroyed = false;
    
    req.session.destroy = () => {
      if (sessionId) {
        sessions.delete(sessionId);
        sessionDestroyed = true;
      }
    };
    
    const response = await next();
    if (!response) return response;
    
    const headers = new Headers(response.headers);
    
    // Only save session if it wasn't destroyed
    if (!sessionDestroyed) {
      req.session._expires = Date.now() + maxAge * 1000;
      sessions.set(sessionId, req.session);
      
      headers.append("Set-Cookie", 
        `${cookieName}=${sessionId}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Path=/`
      );
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
};
// === SECURE HEADERS ===
export const secureHeaders = (options?: {
  xFrameOptions?: string;
  xContentTypeOptions?: boolean;
  xXssProtection?: string;
  strictTransportSecurity?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  contentSecurityPolicy?: string;
}) => {
  const opts = options ?? {};
  return async (req: PrinceRequest, next: Next) => {
    const response = await next();
    if (!response) return response;
    const headers = new Headers(response.headers);
    headers.set("X-Frame-Options",           opts.xFrameOptions            ?? "SAMEORIGIN");
    headers.set("X-XSS-Protection",          opts.xXssProtection           ?? "1; mode=block");
    headers.set("Referrer-Policy",           opts.referrerPolicy           ?? "strict-origin-when-cross-origin");
    if (opts.xContentTypeOptions !== false)
      headers.set("X-Content-Type-Options",  "nosniff");
    if (opts.strictTransportSecurity !== "")
      headers.set("Strict-Transport-Security", opts.strictTransportSecurity ?? "max-age=31536000; includeSubDomains");
    if (opts.permissionsPolicy)
      headers.set("Permissions-Policy",      opts.permissionsPolicy);
    if (opts.contentSecurityPolicy)
      headers.set("Content-Security-Policy", opts.contentSecurityPolicy);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
};

// === REQUEST TIMEOUT ===
export const timeout = (ms: number, message = "Request Timeout") => {
  return async (req: PrinceRequest, next: Next) => {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<Response>((resolve) => {
      timer = setTimeout(() => resolve(
        new Response(JSON.stringify({ error: message }), {
          status: 408,
          headers: { "Content-Type": "application/json" }
        })
      ), ms);
    });
    try {
      const result = await Promise.race([next(), timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timer!);
    }
  };
};

// === REQUEST ID ===
export const requestId = (options?: { header?: string; generator?: () => string }) => {
  const header = options?.header ?? "X-Request-ID";
  const generate = options?.generator ?? (() => crypto.randomUUID());
  return async (req: PrinceRequest, next: Next) => {
    const id = req.headers.get(header) ?? generate();
    req.id = id;
    const response = await next();
    if (!response) return response;
    const headers = new Headers(response.headers);
    headers.set(header, id);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
};

// === IP RESTRICTION ===
export const ipRestriction = (options: { allowList?: string[]; denyList?: string[] }) => {
  const allow = options.allowList ? new Set(options.allowList) : null;
  const deny  = options.denyList  ? new Set(options.denyList)  : null;
  return async (req: PrinceRequest, next: Next) => {
    const ip = req.ip ?? "127.0.0.1";
    if (deny  && deny.has(ip))  return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    if (allow && !allow.has(ip)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    return next();
  };
};

// === STATIC FILES ===
export const serveStatic = (root: string) => {
  const base = root.replace(/\/$/, "");
  return async (req: PrinceRequest, next: Next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const pathname = new URL(req.url).pathname;
    const filePath = base + pathname;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    // Try index.html for directory requests
    if (!pathname.includes(".")) {
      const index = Bun.file(filePath.replace(/\/$/, "") + "/index.html");
      if (await index.exists()) return new Response(index);
    }
    return next();
  };
};

// === JWKS / JWK AUTH ===
// Extends jwt() to also accept a JWKS URL string for Auth0, Clerk, Supabase etc.
import { createRemoteJWKSet } from "jose";

export const jwks = (jwksUrl: string, options?: { algorithms?: string[] }) => {
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));
  return async (req: PrinceRequest, next: Next) => {
    const auth = req.headers.get("authorization");
    req.user = undefined;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      try {
        const { jwtVerify } = await import("jose");
        const { payload } = await jwtVerify(token, JWKS, {
          algorithms: (options?.algorithms ?? ["RS256", "RS512", "ES256", "ES512"]) as any,
        });
        req.user = payload;
      } catch {}
    }
    return next();
  };
};

// === TRIM TRAILING SLASH ===
// Redirects /users/ → /users with a 301. Does nothing for root "/".
export const trimTrailingSlash = (statusCode: 301 | 302 = 301) => {
  const mw = async (req: PrinceRequest, next: Next) => next();
  (mw as any).__trimTrailingSlash = statusCode;
  return mw;
};

// === CSRF PROTECTION ===
// 🔒 NEW: CSRF token generation and validation
export const csrf = (options?: { cookieName?: string; headerName?: string; keyLength?: number }) => {
  const cookieName = options?.cookieName ?? "csrf";
  const headerName = options?.headerName ?? "x-csrf-token";
  const keyLength = options?.keyLength ?? 32;
  
  return async (req: PrinceRequest, next: Next) => {
    // Generate token if not present
    let token = req.cookies?.[cookieName];
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(keyLength)), b =>
        b.toString(16).padStart(2, '0')
      ).join('');
      // Token will be set in response via helper
      req.headers.set(cookieName, token);
    }
    
    // For state-changing requests, validate token
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const provided = req.headers.get(headerName);
      if (!provided || provided !== token) {
        return new Response(
          JSON.stringify({ error: "CSRF validation failed" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    
    const response = await next();
    if (!response) return response;
    
    // Add token to response cookie
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", 
      `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`
    );
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
};

// === MIDDLEWARE COMBINATORS ===

// every(mw1, mw2) — all middleware must pass (short-circuits on first rejection)
export const every = (...middlewares: ((req: PrinceRequest, next: Next) => any)[]) => {
  return async (req: PrinceRequest, next: Next) => {
    let idx = 0;
    const run = async (): Promise<Response> => {
      if (idx >= middlewares.length) return next();
      const mw = middlewares[idx++];
      return mw(req, run);
    };
    return run();
  };
};

// some(mw1, mw2) — first middleware to call next() wins; if all reject, returns last rejection
export const some = (...middlewares: ((req: PrinceRequest, next: Next) => any)[]) => {
  return async (req: PrinceRequest, next: Next) => {
    let lastRejection: Response | undefined;
    for (const mw of middlewares) {
      let passed = false;
      const result = await mw(req, async () => { passed = true; return next(); });
      if (passed) return result;
      lastRejection = result;
    }
    return lastRejection!;
  };
};

// except(path, mw) — applies middleware to all paths EXCEPT the given one (or array of paths)
export const except = (paths: string | string[], ...middlewares: ((req: PrinceRequest, next: Next) => any)[]) => {
  const excluded = new Set(Array.isArray(paths) ? paths : [paths]);
  const combined = every(...middlewares);
  return async (req: PrinceRequest, next: Next) => {
    const url = req.url;
    const ss = url.indexOf("//");
    const pathStart = ss === -1 ? 0 : url.indexOf("/", ss + 2);
    const qIdx = url.indexOf("?", pathStart);
    const pathname = pathStart === -1 ? "/" : (qIdx === -1 ? url.slice(pathStart) : url.slice(pathStart, qIdx));
    if (excluded.has(pathname)) return next();
    return combined(req, next);
  };
};