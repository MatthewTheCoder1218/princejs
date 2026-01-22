// princejs/middleware.ts
// @ts-nocheck 
import type { PrinceRequest } from "./prince";
import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";

type Next = () => Promise<Response | undefined>;
type HandlerReturn = Response | { [key: string]: any } | undefined;

// === CORS ===
export const cors = (origin: string = '*') => {
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

// === LOGGER ===
export const logger = () => {
  return async (req: PrinceRequest, next: Next) => {
    const start = Date.now();
    const res = await next();
    console.log(`${req.method} ${new URL(req.url).pathname} ${res?.status} ${Date.now() - start}ms`);
    return res;
  };
};

// === JWT ===
export const signJWT = async (payload: any, secret: Uint8Array, expiresIn: string) => {
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
  
  return jwt;
};

export const jwt = (key: Uint8Array) => {
  return async (req: PrinceRequest, next: Next) => {
    const auth = req.headers.get("authorization");
    
    req.user = undefined;

    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();

      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ["HS256", "HS512"],
        });
        
        req.user = payload; 
        
      } catch (err) {
        console.error("JWT Verification Failed:", err);
      }
    }
    
    const result = await next();
    return result;
  };
};

// === RATE LIMIT ===
export const rateLimit = (max: number, window = 60) => {
  const store: Record<string, number> = {};
  
  return async (req: PrinceRequest, next: Next) => {
    const ip = 
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-client-ip") ||
      "unknown";
    
    const key = `${ip}:${Math.floor(Date.now() / (window * 1000))}`;
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
    
    if (Math.random() < 0.01) {
      const now = Math.floor(Date.now() / (window * 1000));
      Object.keys(store).forEach(k => {
        const timestamp = parseInt(k.split(":")[1]);
        if (now - timestamp > 2) delete store[k];
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