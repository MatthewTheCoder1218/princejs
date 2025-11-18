// princejs/middleware.ts
import type { PrinceRequest } from "./prince";
import type { StandardSchemaV1 } from "@standard-schema/spec";

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
export const jwt = (secret: string) => {
  return async (req: PrinceRequest, next: Next) => {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        req.user = JSON.parse(atob(auth.slice(7).split(".")[1])) as any;
      } catch {}
    }
    return next();
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

export type StandardSchema<T = unknown> = StandardSchemaV1<T>;

export const validate = <T>(schema: StandardSchema<T>) => {
  return async (req: any, next: () => Promise<Response | undefined>) => {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return next();
    }

    try {
      // ---- Safe JSON Body Reader ----
      let body: any;

      if (req.bodyUsed) {
        body = req.body;
      } else {
        try {
          const text = await req.text();
          body = text ? JSON.parse(text) : undefined;
        } catch {
          body = undefined;
        }
      }

      // ---- ⭐ Standard Schema V1 Validation ----
      const parseFn =
        typeof (schema as any).parseAsync === "function"
          ? (schema as any).parseAsync
          : (schema as any).parse;

      const result = await parseFn(body);

      // result is { value, issues } in V1
      if (result.issues || result.error) {
        return new Response(
          JSON.stringify({
            error: "Validation failed",
            issues: result.issues ?? result.error,
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      req.validated = result.data ?? result.value;
      return next();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON or validation failed" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }
  };
};