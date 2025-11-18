// princejs/middleware.ts
import type { PrinceRequest } from "./prince";
import { z } from "zod";
import { jwtVerify } from "jose";

const encoder = new TextEncoder();

type Next = () => Promise<Response | undefined>;

// === CORS ===
export const cors = (origin = "*") => {
  return async (req: PrinceRequest, next: Next) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        }
      });
    }
    const res = await next();
    res?.headers.set("Access-Control-Allow-Origin", origin);
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
export const jwt = (secretOrKey: string | Uint8Array) => {
  const key = typeof secretOrKey === "string" 
    ? encoder.encode(secretOrKey) 
    : secretOrKey;

  return async (req: any, next: () => Promise<Response | undefined>) => {
    const auth = req.headers.get("authorization");

    if (!auth?.startsWith("Bearer ")) {
      return next();
    }

    const token = auth.slice(7);

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256", "HS512"],
      });

      req.user = payload;
      return next();
    } catch (err) {
      // Invalid token → just continue without user
      return next();
    }
  };
};

// === RATE LIMIT ===
export const rateLimit = (max: number, window = 60) => {
  const store: Record<string, number> = {};
  return async (req: PrinceRequest, next: Next) => {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const key = `${ip}:${Math.floor(Date.now() / (window * 1000))}`;
    store[key] = (store[key] || 0) + 1;
    if (store[key] > max) return new Response("Too many requests", { status: 429 });
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