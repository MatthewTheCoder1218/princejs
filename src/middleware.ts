// princejs/middleware.ts
import type { PrinceRequest } from "./prince";
import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";

type Next = () => Promise<Response | undefined>;
type HandlerReturn = Response | { [key: string]: any } | undefined;

// === CORS ===
export const cors = (origin = "*") => {
  return async (req: PrinceRequest, next: Next) => {
    // Handle preflight OPTIONS request - return immediately without calling next()
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Process the actual request
    const res = await next();
    
    // Add CORS headers to the response
    if (res) {
      const newHeaders = new Headers(res.headers);
      newHeaders.set("Access-Control-Allow-Origin", origin);
      newHeaders.set("Access-Control-Allow-Credentials", "true");
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders
      });
    }
    
    return res;
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
export const signJWT = async (
  payload: object, 
  key: Uint8Array, 
  exp: string = '2h'
): Promise<string> => {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
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
    // Try multiple IP sources in order of reliability
    const ip = 
      req.headers.get("cf-connecting-ip") ||      // Cloudflare
      req.headers.get("x-real-ip") ||             // Nginx
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || // Standard proxy (take first IP)
      req.headers.get("x-client-ip") ||           // Some proxies
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
    
    // Clean up old entries periodically (every 100 requests)
    if (Math.random() < 0.01) {
      const now = Math.floor(Date.now() / (window * 1000));
      Object.keys(store).forEach(k => {
        const timestamp = parseInt(k.split(":")[1]);
        if (now - timestamp > 2) delete store[k]; // Keep last 2 windows
      });
    }
    
    return next();
  };
};

// === VALIDATE ===
export const validate = <T>(schema: z.ZodSchema<T>) => {
  return async (req: PrinceRequest, next: Next) => {
    try {
      req.body = schema.parse(req.body);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: "Invalid", details: e.errors }), { status: 400 });
    }
    return next();
  };
};