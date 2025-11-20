// princejs/middleware.ts
// @ts-nocheck 
import type { PrinceRequest } from "./prince";
import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";

type Next = () => Promise<Response | undefined>;
type HandlerReturn = Response | { [key: string]: any } | undefined;

// === CORS ===
// In middleware.ts - Fix CORS middleware
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
// In middleware.ts - Fix validate middleware
export const validate = (schema: z.ZodSchema) => {
  return async (req: any, next: Function) => {
    try {
      // Use parsedBody instead of body since we fixed body parsing
      if (req.parsedBody) {
        const parsed = schema.parse(req.parsedBody);
        req.parsedBody = parsed; // Replace with validated data
        // Also update body for backward compatibility
        Object.defineProperty(req, 'body', { 
          value: parsed,
          writable: true,
          configurable: true 
        });
      }
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ 
            error: 'Validation failed', 
            details: error.errors.map(e => ({
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
      throw error;
    }
  };
};