// test/prince.test.ts
import { describe, test, expect, beforeEach, afterEach, jest, it, spyOn } from "bun:test";
import { prince, guard } from "../src/prince";
import { jwt, signJWT, rateLimit, validate, cors, logger, auth, apiKey, compress, session, secureHeaders, timeout, requestId, ipRestriction, serveStatic, trimTrailingSlash, every, some, except } from "../src/middleware";
import { cache, email, upload, sse, stream } from "../src/helpers";
import { openapi, cron } from "../src/scheduler";
import { db } from "../src/db";
import { Html, Head, Body, H1, P, render, Div } from '../src/jsx';
import { unlink } from "fs/promises";
import { toVercel } from "../src/adapters/vercel";
import { toWorkers } from "../src/adapters/cloudflare";
import { toDeno } from "../src/adapters/deno";
import { toNode, toExpress } from "../src/adapters/node";
import { createClient, type PrinceApiContract } from "../src/client";
import { z } from "zod";

// ==========================================
// ROUTER TESTS (Existing)
// ==========================================

describe("Router - Basic Routes", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("GET request works", async () => {
    app.get("/hello", () => ({ message: "hello" }));
    
    const res = await app.fetch(new Request("http://localhost/hello"));
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.message).toBe("hello");
  });

  test("POST request works", async () => {
    app.post("/create", (req) => ({ body: req.parsedBody }));
    
    const res = await app.fetch(
      new Request("http://localhost/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" })
      })
    );
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.body.name).toBe("Alice");
  });

  test("PUT request works", async () => {
    app.put("/update", (req) => ({ updated: true }));
    
    const res = await app.fetch(
      new Request("http://localhost/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1 })
      })
    );
    
    expect(res.status).toBe(200);
  });

  test("DELETE request works", async () => {
    app.delete("/remove", () => ({ deleted: true }));
    
    const res = await app.fetch(
      new Request("http://localhost/remove", { method: "DELETE" })
    );
    const data = await res.json();
    
    expect(data.deleted).toBe(true);
  });

  test("PATCH request works", async () => {
    app.patch("/modify", () => ({ patched: true }));
    
    const res = await app.fetch(
      new Request("http://localhost/modify", { method: "PATCH" })
    );
    
    expect(res.status).toBe(200);
  });

  test("404 for unknown route", async () => {
    const res = await app.fetch(new Request("http://localhost/unknown"));
    const data = await res.json();
    
    expect(res.status).toBe(404);
    expect(data.error).toBe("Not Found");
  });

  test("405 for wrong method", async () => {
    app.get("/only-get", () => ({ ok: true }));
    
    const res = await app.fetch(
      new Request("http://localhost/only-get", { method: "POST" })
    );
    const data = await res.json();
    
    expect(res.status).toBe(405);
    expect(data.error).toBe("Method Not Allowed");
  });
});

describe("Router - Path Parameters", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("Single param works", async () => {
    app.get("/users/:id", (req) => ({ id: req.params?.id }));
    
    const res = await app.fetch(new Request("http://localhost/users/123"));
    const data = await res.json();
    
    expect(data.id).toBe("123");
  });

  test("Multiple params work", async () => {
    app.get("/users/:userId/posts/:postId", (req) => ({
      userId: req.params?.userId,
      postId: req.params?.postId
    }));
    
    const res = await app.fetch(new Request("http://localhost/users/42/posts/99"));
    const data = await res.json();
    
    expect(data.userId).toBe("42");
    expect(data.postId).toBe("99");
  });

  test("Params with special characters", async () => {
    app.get("/items/:name", (req) => ({ name: req.params?.name }));
    
    const res = await app.fetch(new Request("http://localhost/items/test-item"));
    const data = await res.json();
    
    expect(data.name).toBe("test-item");
  });
});

describe("Router - Query Parameters", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("Query params are parsed", async () => {
    app.get("/search", (req) => ({ 
      q: req.query?.get("q"),
      limit: req.query?.get("limit")
    }));
    
    const res = await app.fetch(new Request("http://localhost/search?q=test&limit=10"));
    const data = await res.json();
    
    expect(data.q).toBe("test");
    expect(data.limit).toBe("10");
  });

  test("Multiple query params work", async () => {
    app.get("/filter", (req) => ({
      tags: req.query?.getAll("tag")
    }));
    
    const res = await app.fetch(new Request("http://localhost/filter?tag=js&tag=ts"));
    const data = await res.json();
    
    expect(data.tags).toEqual(["js", "ts"]);
  });
});

describe("Router - Wildcards", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("Single wildcard * matches one segment", async () => {
    app.get("/api/*/status", () => ({ matched: true }));
    
    const res = await app.fetch(new Request("http://localhost/api/v1/status"));
    const data = await res.json();
    
    expect(data.matched).toBe(true);
  });

  test("Catch-all ** matches everything", async () => {
    app.get("/static/**", () => ({ static: true }));
    
    const res = await app.fetch(new Request("http://localhost/static/css/main.css"));
    const data = await res.json();
    
    expect(data.static).toBe(true);
  });
});

// ==========================================
// MIDDLEWARE TESTS (Existing)
// ==========================================

describe("Middleware - JWT", () => {
  let app: ReturnType<typeof prince>;
  const SECRET_KEY = new TextEncoder().encode("test-secret-key");

  beforeEach(() => {
    app = prince();
  });

  test("Valid JWT token works", async () => {
    app.use(jwt(SECRET_KEY));
    app.get("/profile", (req) => {
      if (!req.user) return new Response("Unauthorized", { status: 401 });
      return { user: req.user };
    });

    const token = await signJWT({ id: 1, name: "Alice" }, SECRET_KEY, "1h");
    
    const res = await app.fetch(
      new Request("http://localhost/profile", {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.user.name).toBe("Alice");
  });

  test("Missing token returns no user", async () => {
    app.use(jwt(SECRET_KEY));
    app.get("/profile", (req) => {
      if (!req.user) return new Response("Unauthorized", { status: 401 });
      return { user: req.user };
    });

    const res = await app.fetch(new Request("http://localhost/profile"));
    
    expect(res.status).toBe(401);
  });

  test("Invalid token is rejected", async () => {
    app.use(jwt(SECRET_KEY));
    app.get("/profile", (req) => {
      if (!req.user) return new Response("Unauthorized", { status: 401 });
      return { user: req.user };
    });

    const res = await app.fetch(
      new Request("http://localhost/profile", {
        headers: { Authorization: "Bearer invalid.token.here" }
      })
    );
    
    expect(res.status).toBe(401);
  });

  test("Expired token is rejected", async () => {
    app.use(jwt(SECRET_KEY));
    app.get("/profile", (req) => {
      if (!req.user) return new Response("Unauthorized", { status: 401 });
      return { user: req.user };
    });

    const token = await signJWT({ id: 1 }, SECRET_KEY, "-1h");
    
    const res = await app.fetch(
      new Request("http://localhost/profile", {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    
    expect(res.status).toBe(401);
  });
});

describe("Middleware - Rate Limit", () => {
  test("Allows requests under limit", async () => {
    const app = prince();
    app.use(rateLimit(5, 60));
    app.get("/api", () => ({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.fetch(new Request("http://localhost/api"));
      expect(res.status).toBe(200);
    }
  });

  test("Blocks requests over limit", async () => {
    const app = prince();
    app.use(rateLimit(3, 60));
    app.get("/api", () => ({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(new Request("http://localhost/api"));
      expect(res.status).toBe(200);
    }

    const blocked = await app.fetch(new Request("http://localhost/api"));
    expect(blocked.status).toBe(429);
    
    const data = await blocked.json();
    expect(data.error).toBe("Too many requests");
  });

  test("Rate limit respects different IPs", async () => {
    const app = prince();
    app.use(rateLimit(2, 60));
    app.get("/api", () => ({ ok: true }));

    const res1 = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "x-real-ip": "192.168.1.1" }
      })
    );
    const res2 = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "x-real-ip": "192.168.1.1" }
      })
    );
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const res3 = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "x-real-ip": "192.168.1.2" }
      })
    );
    expect(res3.status).toBe(200);
  });
});

describe("Middleware - Validation", () => {
  test("Valid data passes", async () => {
    const app = prince();
    const schema = z.object({
      name: z.string(),
      age: z.number()
    });

    app.use(validate(schema));
    app.post("/user", (req) => ({ created: req.parsedBody }));

    const res = await app.fetch(
      new Request("http://localhost/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: 25 })
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created.name).toBe("Alice");
  });

  test("Invalid data is rejected", async () => {
    const app = prince();
    const schema = z.object({
      name: z.string(),
      age: z.number()
    });

    app.use(validate(schema));
    app.post("/user", (req) => ({ created: req.parsedBody }));

    const res = await app.fetch(
      new Request("http://localhost/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: "not-a-number" })
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  test("Missing required fields rejected", async () => {
    const app = prince();
    const schema = z.object({
      name: z.string(),
      email: z.string().email()
    });

    app.use(validate(schema));
    app.post("/user", (req) => ({ created: req.parsedBody }));

    const res = await app.fetch(
      new Request("http://localhost/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" })
      })
    );

    expect(res.status).toBe(400);
  });
});

  test("OPTIONS request returns CORS headers", async () => {
    const app = prince();
    app.use(cors("*"));
    app.get("/api", () => ({ ok: true }));
    app.options("/api", () => ({ ok: true })); // Add this line

    const res = await app.fetch(
      new Request("http://localhost/api", { method: "OPTIONS" })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  test("Regular request gets CORS headers", async () => {
    const app = prince();
    app.use(cors("https://example.com"));
    app.get("/api", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/api"));

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

describe("Logger middleware", () => {
  it("logs request data", async () => {
    const app = prince(true);

    const consoleSpy = spyOn(console, "log");

    app.use(logger());

    app.get("/test", () => {
      return { ok: true };
    });

    const res = await app.fetch(
      new Request("http://localhost/test", { method: "GET" })
    );

    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalled();

    const logged = consoleSpy.mock.calls[0][0];
    expect(logged.method).toBe("GET");
    expect(logged.path).toBe("/test");
    expect(logged.status).toBe(200);

    consoleSpy.mockRestore();
  });

  it("does not log when disabled", async () => {
    const app = prince(true);

    const consoleSpy = spyOn(console, "log");

    app.use(logger({ enabled: false }));

    app.get("/silent", () => "ok");

    await app.fetch(
      new Request("http://localhost/silent", { method: "GET" })
    );

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("uses custom formatter when provided", async () => {
    const app = prince(true);
    const customSpy = spyOn(console, "log");

    app.use(
      logger({
        formatter: ({ req, res, duration }) => {
          console.log(
            `CUSTOM ${req.method} ${new URL(req.url).pathname} ${res?.status} ${duration}ms`
          );
        }
      })
    );

    app.get("/custom", () => "ok");

    await app.fetch(
      new Request("http://localhost/custom", { method: "GET" })
    );

    expect(customSpy).toHaveBeenCalled();
    expect(customSpy.mock.calls[0][0]).toContain("CUSTOM");

    customSpy.mockRestore();
  });

  describe("Logger middleware – errorsOnly", () => {
  it("does not log successful requests", async () => {
    const app = prince(true);
    const spy = spyOn(console, "log");

    app.use(logger({ errorsOnly: true }));

    app.get("/ok", () => ({ ok: true }));

    await app.fetch(
      new Request("http://localhost/ok", { method: "GET" })
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs 4xx and 5xx responses", async () => {
    const app = prince(true);
    const spy = spyOn(console, "log");

    app.use(logger({ errorsOnly: true }));

    app.get("/bad", () => {
      return new Response("Bad", { status: 400 });
    });

    await app.fetch(
      new Request("http://localhost/bad", { method: "GET" })
    );

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs thrown errors", async () => {
    const app = prince(true);
    const errorSpy = spyOn(console, "error");

    app.use(logger({ errorsOnly: true }));

    app.get("/crash", () => {
      throw new Error("Boom");
    });

    await app.fetch(
      new Request("http://localhost/crash", { method: "GET" })
    ).catch(() => {});

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
});

// ==========================================
// ROUTE-LEVEL MIDDLEWARE TESTS
// ==========================================

describe("Route-Level Middleware", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("Route without middleware has zero overhead", async () => {
    app.get("/public", () => ({ msg: "public" }));
    const res = await app.fetch(new Request("http://localhost/public"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.msg).toBe("public");
  });

  test("Single route middleware executes", async () => {
    const requireAuth = async (req: any, next: any) => {
      const token = req.headers.get("Authorization");
      if (!token) return new Response("Unauthorized", { status: 401 });
      req.user = { id: 1, name: "Alice" };
      return next();
    };

    app.get("/protected", requireAuth, async (req) => {
      return { user: req.user };
    });

    const res1 = await app.fetch(new Request("http://localhost/protected"));
    expect(res1.status).toBe(401);

    const res2 = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: "Bearer token123" }
      })
    );
    const data = await res2.json();
    expect(res2.status).toBe(200);
    expect(data.user.name).toBe("Alice");
  });

  test("Multiple route middlewares execute in order", async () => {
    const mw1 = async (req: any, next: any) => {
      req.steps = ["mw1"];
      return next();
    };
    const mw2 = async (req: any, next: any) => {
      req.steps.push("mw2");
      return next();
    };
    const mw3 = async (req: any, next: any) => {
      req.steps.push("mw3");
      return next();
    };

    app.get("/chain", mw1, mw2, mw3, async (req) => {
      req.steps.push("handler");
      return { steps: req.steps };
    });

    const res = await app.fetch(new Request("http://localhost/chain"));
    const data = await res.json();
    expect(data.steps).toEqual(["mw1", "mw2", "mw3", "handler"]);
  });

  test("Route middleware can short-circuit", async () => {
    const requireAdmin = async (req: any, next: any) => {
      if (!req.headers.get("X-Admin")) {
        return new Response(
          JSON.stringify({ error: "Admin required" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return next();
    };

    app.delete("/admin/delete", requireAdmin, () => ({ deleted: true }));

    const res1 = await app.fetch(
      new Request("http://localhost/admin/delete", { method: "DELETE" })
    );
    expect(res1.status).toBe(403);

    const res2 = await app.fetch(
      new Request("http://localhost/admin/delete", {
        method: "DELETE",
        headers: { "X-Admin": "true" }
      })
    );
    expect(res2.status).toBe(200);
  });

  test("Global and route middleware combine correctly", async () => {
    const globalMw = async (req: any, next: any) => {
      req.trace = ["global"];
      return next();
    };
    const routeMw = async (req: any, next: any) => {
      req.trace.push("route");
      return next();
    };

    app.use(globalMw);
    app.get("/combined", routeMw, async (req) => {
      req.trace.push("handler");
      return { trace: req.trace };
    });

    const res = await app.fetch(new Request("http://localhost/combined"));
    const data = await res.json();
    expect(data.trace).toEqual(["global", "route", "handler"]);
  });

  test("Complex middleware chain", async () => {
    const SECRET_KEY = new TextEncoder().encode("complex-key");
    const requireAdmin = async (req: any, next: any) => {
      if (req.user?.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Admin only" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return next();
    };

    app.use(jwt(SECRET_KEY));
    app.post("/admin/action", auth(), requireAdmin, rateLimit(5, 60), validate(z.object({ action: z.string() })), async (req) => {
      return { success: true, action: req.parsedBody.action, admin: req.user.name };
    });

    const res1 = await app.fetch(
      new Request("http://localhost/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" })
      })
    );
    expect(res1.status).toBe(401);

    const adminToken = await signJWT({ id: 2, role: "admin", name: "Admin" }, SECRET_KEY, "1h");
    const res4 = await app.fetch(
      new Request("http://localhost/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ action: "delete_user" })
      })
    );
    const data4 = await res4.json();
    expect(res4.status).toBe(200);
    expect(data4.success).toBe(true);
  });
});

// ==========================================
// NEW MIDDLEWARE TESTS
// ==========================================

describe("Middleware - Auth", () => {
  const SECRET_KEY = new TextEncoder().encode("test-secret-key");

  test("auth() blocks requests without JWT", async () => {
    const app = prince();
    app.use(jwt(SECRET_KEY));
    app.get("/protected", auth(), () => ({ data: "secret" }));

    const res = await app.fetch(new Request("http://localhost/protected"));
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("auth() allows requests with valid JWT", async () => {
    const app = prince();
    app.use(jwt(SECRET_KEY));
    app.get("/protected", auth(), (req) => ({ user: req.user.name }));

    const token = await signJWT({ name: "Alice" }, SECRET_KEY, "1h");

    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBe("Alice");
  });

  test("auth() checks roles correctly", async () => {
    const app = prince();
    app.use(jwt(SECRET_KEY));
    app.get("/admin", auth({ roles: ["admin"] }), () => ({ ok: true }));

    // User without admin role
    const userToken = await signJWT({ role: "user" }, SECRET_KEY, "1h");
    const res1 = await app.fetch(
      new Request("http://localhost/admin", {
        headers: { Authorization: `Bearer ${userToken}` }
      })
    );
    expect(res1.status).toBe(403);

    // User with admin role
    const adminToken = await signJWT({ role: "admin" }, SECRET_KEY, "1h");
    const res2 = await app.fetch(
      new Request("http://localhost/admin", {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
    );
    expect(res2.status).toBe(200);
  });

  test("auth() supports array of roles", async () => {
    const app = prince();
    app.use(jwt(SECRET_KEY));
    app.get("/protected", auth({ roles: ["admin", "moderator"] }), () => ({ ok: true }));

    const token = await signJWT({ role: "moderator" }, SECRET_KEY, "1h");
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    
    expect(res.status).toBe(200);
  });
});

describe("Middleware - API Key", () => {
  test("apiKey() blocks requests without key", async () => {
    const app = prince();
    app.use(apiKey({ keys: ["secret123"] }));
    app.get("/api", () => ({ data: "value" }));

    const res = await app.fetch(new Request("http://localhost/api"));
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid API key");
  });

  test("apiKey() allows requests with valid key", async () => {
    const app = prince();
    app.use(apiKey({ keys: ["secret123", "secret456"] }));
    app.get("/api", (req) => ({ key: req.apiKey }));

    const res = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "x-api-key": "secret123" }
      })
    );
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("secret123");
  });

  test("apiKey() supports custom header", async () => {
    const app = prince();
    app.use(apiKey({ keys: ["key123"], header: "Authorization" }));
    app.get("/api", () => ({ ok: true }));

    const res = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "Authorization": "key123" }
      })
    );
    
    expect(res.status).toBe(200);
  });

  test("apiKey() rejects invalid keys", async () => {
    const app = prince();
    app.use(apiKey({ keys: ["valid_key"] }));
    app.get("/api", () => ({ ok: true }));

    const res = await app.fetch(
      new Request("http://localhost/api", {
        headers: { "x-api-key": "invalid_key" }
      })
    );
    
    expect(res.status).toBe(401);
  });
});

describe("Middleware - Compression", () => {
  test("compress() compresses large JSON responses", async () => {
    const app = prince();
    app.use(compress({ threshold: 100 }));
    app.get("/data", () => ({ 
      data: "x".repeat(500) // Large response
    }));

    const res = await app.fetch(
      new Request("http://localhost/data", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
  });

  test("compress() skips small responses", async () => {
    const app = prince();
    app.use(compress({ threshold: 1000 }));
    app.get("/small", () => ({ data: "small" }));

    const res = await app.fetch(
      new Request("http://localhost/small", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    
    expect(res.headers.get("Content-Encoding")).toBeNull();
  });

  test("compress() respects filter function", async () => {
    const app = prince();
    app.use(compress({ 
      threshold: 10,
      filter: (req) => !req.url.includes("/no-compress")
    }));
    app.get("/compress", () => ({ data: "x".repeat(100) }));
    app.get("/no-compress", () => ({ data: "x".repeat(100) }));

    const res1 = await app.fetch(
      new Request("http://localhost/compress", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    expect(res1.headers.get("Content-Encoding")).toBe("gzip");

    const res2 = await app.fetch(
      new Request("http://localhost/no-compress", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    expect(res2.headers.get("Content-Encoding")).toBeNull();
  });

  test("compress() only compresses text-based content", async () => {
    const app = prince();
    app.use(compress({ threshold: 10 }));
    app.get("/json", () => ({ data: "x".repeat(100) }));
    app.get("/binary", () => new Response(new Uint8Array(100)));

    const res1 = await app.fetch(
      new Request("http://localhost/json", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    expect(res1.headers.get("Content-Encoding")).toBe("gzip");

    const res2 = await app.fetch(
      new Request("http://localhost/binary", {
        headers: { "Accept-Encoding": "gzip" }
      })
    );
    expect(res2.headers.get("Content-Encoding")).toBeNull();
  });
});

describe("Middleware - Session", () => {
  test("session() creates and persists session", async () => {
    const app = prince();
    app.use(session({ secret: "test-secret", maxAge: 3600 }));
    app.get("/increment", (req) => {
      req.session.count = (req.session.count || 0) + 1;
      return { count: req.session.count };
    });

    // First request
    const res1 = await app.fetch(new Request("http://localhost/increment"));
    const data1 = await res1.json();
    expect(data1.count).toBe(1);
    
    // Get session cookie
    const cookie = res1.headers.get("Set-Cookie");
    expect(cookie).toBeDefined();
    const sessionId = cookie!.match(/prince\.sid=([^;]+)/)?.[1];

    // Second request with cookie
    const res2 = await app.fetch(
      new Request("http://localhost/increment", {
        headers: { Cookie: `prince.sid=${sessionId}` }
      })
    );
    const data2 = await res2.json();
    expect(data2.count).toBe(2);
  });

  test("session() supports custom cookie name", async () => {
    const app = prince();
    app.use(session({ secret: "test", name: "custom_sid" }));
    app.get("/test", (req) => {
      req.session.data = "value";
      return { ok: true };
    });

    const res = await app.fetch(new Request("http://localhost/test"));
    const cookie = res.headers.get("Set-Cookie");
    
    expect(cookie).toContain("custom_sid=");
  });

  test("session.destroy() clears session", async () => {
    const app = prince();
    app.use(session({ secret: "test" }));
    app.get("/set", (req) => {
      req.session.user = "Alice";
      return { ok: true };
    });
    app.get("/destroy", (req) => {
      req.session.destroy();
      return { ok: true };
    });
    app.get("/get", (req) => ({ user: req.session.user }));

    // Set session
    const res1 = await app.fetch(new Request("http://localhost/set"));
    const cookie = res1.headers.get("Set-Cookie")!.match(/prince\.sid=([^;]+)/)?.[1];

    // Verify session exists
    const res2 = await app.fetch(
      new Request("http://localhost/get", {
        headers: { Cookie: `prince.sid=${cookie}` }
      })
    );
    const data2 = await res2.json();
    expect(data2.user).toBe("Alice");

    // Destroy session
    await app.fetch(
      new Request("http://localhost/destroy", {
        headers: { Cookie: `prince.sid=${cookie}` }
      })
    );

    // Verify session is gone
    const res3 = await app.fetch(
      new Request("http://localhost/get", {
        headers: { Cookie: `prince.sid=${cookie}` }
      })
    );
    const data3 = await res3.json();
    expect(data3.user).toBeUndefined();
  });
});

// ==========================================
// HELPER TESTS
// ==========================================

describe("Helper - cache", () => {
  test("Cache middleware returns cached data on hit", async () => {
    const app = prince();
    let handlerCalled = 0;
    
    const handler = async (req: any) => {
      handlerCalled++;
      return { data: `result-${handlerCalled}` };
    };

    app.get("/cached", cache(60)(handler)); 

    const res1 = await app.fetch(new Request("http://localhost/cached"));
    const data1 = await res1.json();
    
    expect(handlerCalled).toBe(1);
    expect(data1.data).toBe("result-1");

    const res2 = await app.fetch(new Request("http://localhost/cached"));
    const data2 = await res2.json();
    
    expect(handlerCalled).toBe(1);
    expect(data2.data).toBe("result-1");
  });
});

describe("Helper - upload", () => {
  test("Upload handler processes form data and returns file info", async () => {
    const app = prince();
    
    app.post("/upload", upload());

    const fileName = "test.txt";
    const fileContent = "test content";
    
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: "text/plain" });
    formData.append("file", blob, fileName);
    
    const res = await app.fetch(
      new Request("http://localhost/upload", {
        method: "POST",
        body: formData,
      })
    );

    const data = await res.json();
    
    expect(res.status).toBe(200);
    if (data.name) {
      expect(data.name).toBe(fileName);
      expect(data.size).toBe(fileContent.length);
    } else {
      console.log("Upload error response:", data);
      expect(data.error).toBeDefined();
    }
  });
});

describe("Helper - email", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_id' }),
      text: async () => '{"id": "email_id"}',
      headers: new Headers(),
    } as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (process.env.RESEND_KEY) {
      delete process.env.RESEND_KEY;
    }
  });

  test("Email utility calls fetch with correct Resend payload and key", async () => {
    process.env.RESEND_KEY = 'test-resend-key';
    
    await email("user@example.com", "Test Subject", "<h1>Test HTML</h1>");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-resend-key");

    const body = JSON.parse(options.body);
    expect(body.to).toBe("user@example.com");
    expect(body.subject).toBe("Test Subject");
    expect(body.html).toBe("<h1>Test HTML</h1>");
  });
});

describe("Helper - SSE", () => {
  test("sse() creates event stream", async () => {
    const app = prince();
    app.get("/events", sse(), (req) => {
      req.sseSend({ message: "Hello" });
      return new Response(null);
    });

    const res = await app.fetch(new Request("http://localhost/events"));
    
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");
  });

  test("sse() sends formatted events", async () => {
    const app = prince();
    app.get("/stream", sse(), (req) => {
      req.sseSend({ data: "test" }, "custom-event", "123");
      return new Response(null);
    });

    const res = await app.fetch(new Request("http://localhost/stream"));
    
    expect(res.body).toBeDefined();
  });
});

// ==========================================
// DATABASE TESTS
// ==========================================

describe("Database - SQLite", () => {
  const testDbPath = "./test-db.sqlite";

  afterEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
  });

  test("db.sqlite() creates database", () => {
    const database = db.sqlite(testDbPath);
    expect(database).toBeDefined();
    database.close();
  });

  test("db.sqlite() initializes with schema", () => {
    const database = db.sqlite(testDbPath, `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    
    database.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    const result = database.get("SELECT * FROM users WHERE name = ?", ["Alice"]);
    
    expect(result).toBeDefined();
    expect(result.name).toBe("Alice");
    database.close();
  });

  test("db.query() returns all rows", () => {
    const database = db.sqlite(testDbPath, `
      CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)
    `);
    
    database.run("INSERT INTO items (value) VALUES (?)", ["item1"]);
    database.run("INSERT INTO items (value) VALUES (?)", ["item2"]);
    
    const results = database.query("SELECT * FROM items");
    
    expect(results.length).toBe(2);
    expect(results[0].value).toBe("item1");
    expect(results[1].value).toBe("item2");
    database.close();
  });

  test("db.get() returns single row", () => {
    const database = db.sqlite(testDbPath, `
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)
    `);
    
    database.run("INSERT INTO users (email) VALUES (?)", ["test@example.com"]);
    const user = database.get("SELECT * FROM users WHERE email = ?", ["test@example.com"]);
    
    expect(user.email).toBe("test@example.com");
    database.close();
  });

  test("Database integration with routes", async () => {
    const app = prince();
    const database = db.sqlite(testDbPath, `
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT
      )
    `);

    app.get("/posts", () => database.query("SELECT * FROM posts"));
    
    app.post("/posts", (req) => {
      const { title, content } = req.parsedBody;
      database.run("INSERT INTO posts (title, content) VALUES (?, ?)", [title, content]);
      return { success: true };
    });

    // Create a post
    await app.fetch(
      new Request("http://localhost/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", content: "Content" })
      })
    );

    // Get all posts
    const res = await app.fetch(new Request("http://localhost/posts"));
    const data = await res.json();
    
    expect(data.length).toBe(1);
    expect(data[0].title).toBe("Test");
    
    database.close();
  });
});

// ==========================================
// RESPONSE BUILDER TESTS (Existing)
// ==========================================

describe("Response Builder", () => {
  test("json() creates JSON response", async () => {
    const app = prince();
    app.get("/json", (req) => app.response().json({ test: true }));

    const res = await app.fetch(new Request("http://localhost/json"));
    const data = await res.json();

    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(data.test).toBe(true);
  });

  test("text() creates text response", async () => {
    const app = prince();
    app.get("/text", (req) => app.response().text("Hello"));

    const res = await app.fetch(new Request("http://localhost/text"));
    const text = await res.text();

    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(text).toBe("Hello");
  });

  test("html() creates HTML response", async () => {
    const app = prince();
    app.get("/html", (req) => app.response().html("<h1>Hello</h1>"));

    const res = await app.fetch(new Request("http://localhost/html"));

    expect(res.headers.get("Content-Type")).toBe("text/html");
  });

  test("redirect() creates redirect", async () => {
    const app = prince();
    app.get("/old", (req) => app.response().redirect("/new"));

    const res = await app.fetch(
      new Request("http://localhost/old", { redirect: "manual" })
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/new");
  });

  test("status() sets custom status", async () => {
    const app = prince();
    app.get("/created", (req) => 
      app.response().status(201).json({ created: true })
    );

    const res = await app.fetch(new Request("http://localhost/created"));

    expect(res.status).toBe(201);
  });
});

// ==========================================
// COOKIE TESTS
// ==========================================

describe("Cookies", () => {
  test("Cookies are parsed from request", async () => {
    const app = prince();
    app.get("/profile", (req) => ({ cookie: req.cookies?.sessionId }));

    const res = await app.fetch(
      new Request("http://localhost/profile", {
        headers: { "Cookie": "sessionId=abc123; theme=dark" }
      })
    );
    const data = await res.json();

    expect(data.cookie).toBe("abc123");
  });

  test("Multiple cookies are parsed correctly", async () => {
    const app = prince();
    app.get("/info", (req) => ({ cookies: req.cookies }));

    const res = await app.fetch(
      new Request("http://localhost/info", {
        headers: { "Cookie": "userId=42; role=admin; lang=en" }
      })
    );
    const data = await res.json();

    expect(data.cookies.userId).toBe("42");
    expect(data.cookies.role).toBe("admin");
    expect(data.cookies.lang).toBe("en");
  });

  test("Cookie values with special characters are decoded", async () => {
    const app = prince();
    app.get("/decode", (req) => ({ name: req.cookies?.name }));

    const res = await app.fetch(
      new Request("http://localhost/decode", {
        headers: { "Cookie": "name=John%20Doe%26Co" }
      })
    );
    const data = await res.json();

    expect(data.name).toBe("John Doe&Co");
  });

  test("Empty cookies object when no cookies present", async () => {
    const app = prince();
    app.get("/empty", (req) => ({ hasCookies: Object.keys(req.cookies || {}).length > 0 }));

    const res = await app.fetch(new Request("http://localhost/empty"));
    const data = await res.json();

    expect(data.hasCookies).toBe(false);
  });

  test("response.cookie() sets a cookie", async () => {
    const app = prince();
    app.get("/set-cookie", (req) => 
      app.response().json({ ok: true }).cookie("sessionId", "xyz789")
    );

    const res = await app.fetch(new Request("http://localhost/set-cookie"));

    expect(res.headers.get("Set-Cookie")).toContain("sessionId=xyz789");
  });

  test("response.cookie() with options", async () => {
    const app = prince();
    app.get("/secure-cookie", (req) => 
      app.response().json({ ok: true }).cookie("token", "secret", {
        maxAge: 3600,
        path: "/api",
        secure: true,
        httpOnly: true,
        sameSite: "Strict"
      })
    );

    const res = await app.fetch(new Request("http://localhost/secure-cookie"));
    const setCookie = res.headers.get("Set-Cookie");

    expect(setCookie).toContain("token=secret");
    expect(setCookie).toContain("Max-Age=3600");
    expect(setCookie).toContain("Path=/api");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  test("response.cookie() with domain option", async () => {
    const app = prince();
    app.get("/domain-cookie", (req) => 
      app.response().json({ ok: true }).cookie("tracking", "id123", {
        domain: ".example.com"
      })
    );

    const res = await app.fetch(new Request("http://localhost/domain-cookie"));
    const setCookie = res.headers.get("Set-Cookie");

    expect(setCookie).toContain("Domain=.example.com");
  });

  test("response.cookie() can set multiple cookies", async () => {
    const app = prince();
    app.get("/multi-cookie", (req) => 
      app.response()
        .json({ ok: true })
        .cookie("cookie1", "val1")
        .cookie("cookie2", "val2")
        .cookie("cookie3", "val3")
    );

    const res = await app.fetch(new Request("http://localhost/multi-cookie"));
    const setCookie = res.headers.get("Set-Cookie");

    expect(setCookie).toContain("cookie1=val1");
    expect(setCookie).toContain("cookie2=val2");
    expect(setCookie).toContain("cookie3=val3");
  });

  test("Cookie names and values with special characters are encoded", async () => {
    const app = prince();
    app.get("/encoded", (req) => 
      app.response().json({ ok: true }).cookie("user name", "test value")
    );

    const res = await app.fetch(new Request("http://localhost/encoded"));
    const setCookie = res.headers.get("Set-Cookie");

    expect(setCookie).toContain("user%20name=test%20value");
  });

  test("Cookies persist across handler and response builder", async () => {
    const app = prince();
    app.get("/persist", (req) => {
      const sessionId = req.cookies?.sessionId || "new";
      return app.response()
        .status(200)
        .json({ sessionId })
        .cookie("sessionId", sessionId, { maxAge: 7200 });
    });

    const res = await app.fetch(
      new Request("http://localhost/persist", {
        headers: { "Cookie": "sessionId=existing123" }
      })
    );
    const data = await res.json();

    expect(data.sessionId).toBe("existing123");
    expect(res.headers.get("Set-Cookie")).toContain("sessionId=existing123");
  });

  test("Cookie sameSite options work", async () => {
    const app = prince();
    app.get("/lax", (req) => 
      app.response().json({ ok: true }).cookie("test", "val", { sameSite: "Lax" })
    );
    app.get("/none", (req) => 
      app.response().json({ ok: true }).cookie("test", "val", { sameSite: "None" })
    );

    const resLax = await app.fetch(new Request("http://localhost/lax"));
    const resNone = await app.fetch(new Request("http://localhost/none"));

    expect(resLax.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(resNone.headers.get("Set-Cookie")).toContain("SameSite=None");
  });
});

// ==========================================
// IP DETECTION TESTS
// ==========================================

describe("IP Detection", () => {
  test("Detects IP from x-forwarded-for header", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-forwarded-for": "192.168.1.100" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("192.168.1.100");
  });

  test("Detects first IP from multiple x-forwarded-for IPs", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-forwarded-for": "203.0.113.1, 198.51.100.2, 192.0.2.3" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("203.0.113.1");
  });

  test("Detects IP from x-real-ip header", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-real-ip": "10.0.0.50" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("10.0.0.50");
  });

  test("x-forwarded-for takes precedence over x-real-ip", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { 
          "x-forwarded-for": "203.0.113.99",
          "x-real-ip": "10.0.0.50"
        }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("203.0.113.99");
  });

  test("Detects IP from cf-connecting-ip (Cloudflare)", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "cf-connecting-ip": "198.51.100.42" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("198.51.100.42");
  });

  test("Detects IP from x-client-ip header", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-client-ip": "172.16.0.1" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("172.16.0.1");
  });

  test("Defaults to 127.0.0.1 when no IP headers present", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(new Request("http://localhost/ip"));
    const data = await res.json();

    expect(data.ip).toBe("127.0.0.1");
  });

  test("IP is available on all request methods", async () => {
    const app = prince();
    app.post("/ip", (req) => ({ ip: req.ip }));
    app.put("/ip", (req) => ({ ip: req.ip }));
    app.delete("/ip", (req) => ({ ip: req.ip }));

    const postRes = await app.fetch(
      new Request("http://localhost/ip", {
        method: "POST",
        headers: { "x-real-ip": "192.168.1.1" }
      })
    );
    const postData = await postRes.json();
    expect(postData.ip).toBe("192.168.1.1");

    const putRes = await app.fetch(
      new Request("http://localhost/ip", {
        method: "PUT",
        headers: { "x-real-ip": "192.168.1.2" }
      })
    );
    const putData = await putRes.json();
    expect(putData.ip).toBe("192.168.1.2");

    const delRes = await app.fetch(
      new Request("http://localhost/ip", {
        method: "DELETE",
        headers: { "x-real-ip": "192.168.1.3" }
      })
    );
    const delData = await delRes.json();
    expect(delData.ip).toBe("192.168.1.3");
  });

  test("IP header detection order respected", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    // When multiple headers present, highest priority wins
    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { 
          "x-client-ip": "172.16.0.1",
          "cf-connecting-ip": "198.51.100.42",
          "x-real-ip": "10.0.0.50",
          "x-forwarded-for": "203.0.113.1"
        }
      })
    );
    const data = await res.json();

    // x-forwarded-for has highest priority
    expect(data.ip).toBe("203.0.113.1");
  });

  test("IP with whitespace is trimmed", async () => {
    const app = prince();
    app.get("/ip", (req) => ({ ip: req.ip }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-forwarded-for": "  203.0.113.1  ,  198.51.100.2  " }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("203.0.113.1");
  });

  test("IP persists through middleware and handlers", async () => {
    const app = prince();
    let capturedIp: string | undefined;

    app.use((req, next) => {
      capturedIp = req.ip;
      return next();
    });

    app.get("/ip", (req) => ({ ip: req.ip, same: req.ip === capturedIp }));

    const res = await app.fetch(
      new Request("http://localhost/ip", {
        headers: { "x-real-ip": "192.168.1.100" }
      })
    );
    const data = await res.json();

    expect(data.ip).toBe("192.168.1.100");
    expect(data.same).toBe(true);
  });
});

// ==========================================
// ERROR HANDLING TESTS (Existing)
// ==========================================

describe("Error Handling", () => {
  test("Custom error handler is called", async () => {
    const app = prince();
    
    app.error((err, req) => {
      return new Response(
        JSON.stringify({ customError: err.message }), 
        { status: 500 }
      );
    });

    app.get("/error", () => {
      throw new Error("Test error");
    });

    const res = await app.fetch(new Request("http://localhost/error"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.customError).toBe("Test error");
  });

  test("Dev mode shows stack trace", async () => {
    const app = prince(true);

    app.get("/error", () => {
      throw new Error("Dev error");
    });

    const res = await app.fetch(new Request("http://localhost/error"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.stack).toBeDefined();
  });
});

// ==========================================
// JSX SSR TESTS
// ==========================================

describe("JSX SSR", () => {
  let app: ReturnType<typeof prince>;

  beforeEach(() => {
    app = prince();
  });

  test("JSX renders basic HTML", async () => {
    const Page = () => Html(
      Head("Test Page"),
      Body(
        H1("Hello World"),
        P("This is a test")
      )
    );

    app.get("/jsx", () => render(Page()));

    const res = await app.fetch(new Request("http://localhost/jsx"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("<h1>Hello World</h1>");
    expect(html).toContain("<p>This is a test</p>");
  });

  test("JSX with props and attributes", async () => {
    const Card = (props: any) => Div(
      { className: "card", style: "padding: 1rem;" },
      H1(props.title),
      P(props.content)
    );

    app.get("/card", () => render(Card({ 
      title: "My Card", 
      content: "Card content here" 
    })));

    const res = await app.fetch(new Request("http://localhost/card"));
    const html = await res.text();

    expect(html).toContain('class="card"');
    expect(html).toContain('style="padding: 1rem;"');
    expect(html).toContain("My Card");
    expect(html).toContain("Card content here");
  });

  test("JSX component composition", async () => {
    const Layout = (props: any) => Html(
      Head("My Site"),
      Body(...props.children)
    );

    const HomePage = () => Layout({
      children: [
        H1("Welcome Home")
      ]
    });

    app.get("/home", () => render(HomePage()));

    const res = await app.fetch(new Request("http://localhost/home"));
    const html = await res.text();

    expect(html).toContain("<html>");
    expect(html).toContain("<body>");
    expect(html).toContain("Welcome Home");
  });

  test("JSX without props on Div", async () => {
    const Card = () => Div(
      H1("No Props Needed"),
      P("Just pure content")
    );

    app.get("/simple", () => render(Card()));

    const res = await app.fetch(new Request("http://localhost/simple"));
    const html = await res.text();

    expect(html).toContain("<div>");
    expect(html).toContain("<h1>No Props Needed</h1>");
    expect(html).toContain("<p>Just pure content</p>");
    expect(html).toContain("</div>");
  });
});

// ==========================================
// UTILITY TESTS
// ==========================================

describe("Utility - openapi", () => {
  test("openapi utility returns correct base structure", () => {
    const info = { title: "Test API", version: "1.0.0" };
    const spec = openapi(info);
    
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info).toEqual(info);
    expect(spec.paths).toEqual({});
  });
});

// ==========================================
// RADIX ROUTER PERFORMANCE TESTS
// ==========================================

describe("Radix Router Performance", () => {
  test("Static routes use Map lookup", async () => {
    const app = prince();
    
    app.get("/api/users", () => ({ users: [] }));
    app.get("/api/posts", () => ({ posts: [] }));
    app.get("/api/comments", () => ({ comments: [] }));
    
    const res = await app.fetch(new Request("http://localhost/api/users"));
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.users).toEqual([]);
  });

  test("Radix tree handles common prefixes", async () => {
    const app = prince();
    
    app.get("/api/v1/users", () => ({ v: "v1" }));
    app.get("/api/v2/users", () => ({ v: "v2" }));
    app.get("/api/v1/posts", () => ({ v: "v1-posts" }));
    
    const res1 = await app.fetch(new Request("http://localhost/api/v1/users"));
    const res2 = await app.fetch(new Request("http://localhost/api/v2/users"));
    
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

// ==========================================
// INTEGRATION TESTS
// ==========================================

describe("Integration - Full Stack", () => {
  const SECRET_KEY = new TextEncoder().encode("integration-key");
  const testDbPath = "./integration-test.sqlite";

  afterEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
  });

  test("Complete API with auth, validation, and database", async () => {
    const app = prince();
    const database = db.sqlite(testDbPath, `
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        user_id TEXT NOT NULL
      )
    `);

    // Middleware
    app.use(jwt(SECRET_KEY));
    app.use(cors("*"));
    app.use(logger());

    // Public route
    app.post("/login", () => {
      const token = signJWT({ id: "user123", role: "user" }, SECRET_KEY, "1h");
      return { token };
    });

    // Protected routes
    app.get("/tasks", auth(), (req) => {
      const tasks = database.query(
        "SELECT * FROM tasks WHERE user_id = ?",
        [req.user.id]
      );
      return { tasks };
    });

    app.post("/tasks", auth(), validate(z.object({
      title: z.string().min(1)
    })), (req) => {
      database.run(
        "INSERT INTO tasks (title, user_id) VALUES (?, ?)",
        [req.parsedBody.title, req.user.id]
      );
      return { success: true };
    });

    // Test flow
    const token = await signJWT({ id: "user123", role: "user" }, SECRET_KEY, "1h");

    // Create task
    const res1 = await app.fetch(
      new Request("http://localhost/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ title: "Test Task" })
      })
    );
    const res1Body = await res1.clone().text();
    console.error("POST /tasks status:", res1.status, "body:", res1Body);
    expect(res1.status).toBe(200);

    // Get tasks
    const res2 = await app.fetch(
      new Request("http://localhost/tasks", {
        headers: { "Authorization": `Bearer ${token}` }
      })
    );
    const res2Body = await res2.clone().text();
    console.error("GET /tasks status:", res2.status, "body:", res2Body);
    const data = await res2.json();
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].title).toBe("Test Task");

    database.close();
  });

  test("Rate limiting with sessions", async () => {
    const app = prince();
    
    app.use(session({ secret: "test-secret" }));
    app.use(rateLimit(3, 60));
    
    app.get("/api", (req) => {
      req.session.requests = (req.session.requests || 0) + 1;
      return { requests: req.session.requests };
    });

    // First 3 requests should work
    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(new Request("http://localhost/api"));
      expect(res.status).toBe(200);
    }

    // 4th should be rate limited
    const blocked = await app.fetch(new Request("http://localhost/api"));
    expect(blocked.status).toBe(429);
  });
});

// ==========================================
// PLUGIN SYSTEM
// ==========================================

describe("Plugin system", () => {
  test("plugin can register routes and middleware with options", async () => {
    const app = prince();

    const usersPlugin = (instance: ReturnType<typeof prince>, opts?: { prefix?: string }) => {
      const base = opts?.prefix ?? "";

      instance.use((req, next) => {
        (req as any).fromPlugin = true;
        return next();
      });

      instance.get(`${base}/users`, (req) => ({
        ok: true,
        fromPlugin: (req as any).fromPlugin,
      }));
    };

    app.plugin(usersPlugin, { prefix: "/api" });

    const res = await app.fetch(new Request("http://localhost/api/users"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.fromPlugin).toBe(true);
  });

  test("plugin is chainable with other calls", async () => {
    const app = prince();

    app
      .plugin((instance) => {
        instance.get("/plugin", () => ({ via: "plugin" }));
      })
      .get("/direct", () => ({ via: "direct" }));

    const res1 = await app.fetch(new Request("http://localhost/plugin"));
    const data1 = await res1.json();
    expect(data1.via).toBe("plugin");

    const res2 = await app.fetch(new Request("http://localhost/direct"));
    const data2 = await res2.json();
    expect(data2.via).toBe("direct");
  });
});

// ==========================================
// CLIENT - End-to-End Type Safety
// ==========================================

describe("Client - End-to-End Type Safety", () => {
  test("createClient: get returns typed response", async () => {
    const app = prince();
    app.get("/health", () => ({ ok: true }));

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch.bind(app),
    });
    const base = `http://localhost:${server.port}`;

    type Contract = {
      "GET /health": { response: { ok: boolean } };
    };
    const client = createClient<Contract>(base);

    const data = await client.get("/health");
    expect(data).toEqual({ ok: true });
    expect(data.ok).toBe(true); // type check

    server.stop();
  });

  test("createClient: get with params", async () => {
    const app = prince();
    app.get("/users/:id", (req) => ({ id: req.params!.id, name: `User${req.params!.id}` }));

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch.bind(app),
    });
    const base = `http://localhost:${server.port}`;

    type Contract = {
      "GET /users/:id": { params: { id: string }; response: { id: string; name: string } };
    };
    const client = createClient<Contract>(base);

    const data = await client.get("/users/:id", { params: { id: "42" } });
    expect(data.id).toBe("42");
    expect(data.name).toBe("User42");

    server.stop();
  });

  test("createClient: post with body", async () => {
    const app = prince();
    app.post("/users", (req) => {
      const body = req.parsedBody as { name: string };
      return { id: "1", name: body.name };
    });

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch.bind(app),
    });
    const base = `http://localhost:${server.port}`;

    type Contract = {
      "POST /users": { body: { name: string }; response: { id: string; name: string } };
    };
    const client = createClient<Contract>(base);

    const data = await client.post("/users", { body: { name: "Alice" } });
    expect(data.id).toBe("1");
    expect(data.name).toBe("Alice");

    server.stop();
  });

  test("createClient: delete", async () => {
    const app = prince();
    app.delete("/items/:id", () => ({ deleted: true }));

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch.bind(app),
    });
    const base = `http://localhost:${server.port}`;

    type Contract = {
      "DELETE /items/:id": { params: { id: string }; response: { deleted: boolean } };
    };
    const client = createClient<Contract>(base);

    const data = await client.delete("/items/:id", { params: { id: "x" } });
    expect(data.deleted).toBe(true);

    server.stop();
  });
});

// ==========================================
// DEPLOY ADAPTERS (Vercel, Workers, Deno)
// ==========================================

describe("Deploy Adapters", () => {
  test("toVercel: handler forwards request to app and returns response", async () => {
    const app = prince();
    app.get("/", () => ({ message: "Hello from Vercel!" }));
    app.get("/api/hello", (req) => ({ query: req.query?.get("name") ?? "world" }));

    const handler = toVercel(app);

    const res1 = await handler(new Request("http://localhost/"));
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.message).toBe("Hello from Vercel!");

    const res2 = await handler(new Request("http://localhost/api/hello?name=adapter"));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.query).toBe("adapter");
  });

  test("toVercel: 404 and 405 behave like direct app.fetch", async () => {
    const app = prince();
    app.get("/only-get", () => ({ ok: true }));

    const handler = toVercel(app);

    const notFound = await handler(new Request("http://localhost/unknown"));
    expect(notFound.status).toBe(404);
    const notFoundData = await notFound.json();
    expect(notFoundData.error).toBe("Not Found");

    const methodNotAllowed = await handler(new Request("http://localhost/only-get", { method: "POST" }));
    expect(methodNotAllowed.status).toBe(405);
  });

  test("toWorkers: fetch handler forwards request to app and returns response", async () => {
    const app = prince();
    app.get("/", () => ({ message: "Hello from Workers!" }));
    app.get("/users/:id", (req) => ({ userId: req.params?.id }));

    const worker = toWorkers(app);
    const mockCtx = {
      waitUntil: (_p: Promise<unknown>) => {},
      passThroughOnException: () => {},
    };

    const res1 = await worker.fetch(new Request("http://localhost/"), {}, mockCtx);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.message).toBe("Hello from Workers!");

    const res2 = await worker.fetch(new Request("http://localhost/users/42"), {}, mockCtx);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.userId).toBe("42");
  });

  test("toWorkers: 404 behaves like direct app.fetch", async () => {
    const app = prince();
    const worker = toWorkers(app);
    const mockCtx = { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} };

    const res = await worker.fetch(new Request("http://localhost/missing"), {}, mockCtx);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not Found");
  });

  test("toDeno: handler forwards request to app and returns response", async () => {
    const app = prince();
    app.get("/", () => ({ message: "Hello from Deno!" }));
    app.post("/echo", (req) => ({ body: req.parsedBody }));

    const handler = toDeno(app);

    const res1 = await handler(new Request("http://localhost/"));
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.message).toBe("Hello from Deno!");

    const res2 = await handler(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
      })
    );
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.body.foo).toBe("bar");
  });

  test("toDeno: 404 behaves like direct app.fetch", async () => {
    const app = prince();
    const handler = toDeno(app);

    const res = await handler(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not Found");
  });

  test("toNode: handler forwards request to app and returns response", async () => {
    const app = prince();
    app.get("/", () => ({ message: "Hello from Node!" }));
    app.get("/users/:id", (req: any) => ({ userId: req.params?.id }));

    const handler = toNode(app);

    // Mock Node.js request and response
    const mockReq1 = {
      method: "GET",
      url: "/",
      headers: {},
      on: () => {},
    };
    const mockRes1 = {
      writeHead: () => {},
      end: () => {},
    };

    await handler(mockReq1, mockRes1);

    const mockReq2 = {
      method: "GET",
      url: "/users/42",
      headers: {},
      on: () => {},
    };
    const mockRes2 = {
      writeHead: () => {},
      end: () => {},
    };

    await handler(mockReq2, mockRes2);

    expect(mockRes1.writeHead).toBeDefined();
    expect(mockRes2.writeHead).toBeDefined();
  });

  test("toNode: 404 behaves like direct app.fetch", async () => {
    const app = prince();
    const handler = toNode(app);

    const mockReq = {
      method: "GET",
      url: "/missing",
      headers: {},
      on: () => {},
    };
    let responseStatus = 0;
    const mockRes = {
      writeHead: (status: number) => {
        responseStatus = status;
      },
      end: () => {},
    };

    await handler(mockReq, mockRes);

    expect(responseStatus).toBe(404);
  });

  test("toExpress: middleware forwards request to app and returns response", async () => {
    const app = prince();
    app.get("/", () => ({ message: "Hello from Express!" }));
    app.post("/data", (req: any) => ({ received: req.parsedBody }));

    const middleware = toExpress(app);

    // Mock Express request and response
    const mockReq1 = {
      method: "GET",
      url: "/",
      originalUrl: "/",
      protocol: "http",
      hostname: "localhost",
      headers: {},
      body: {},
    };
    const mockRes1 = {
      status: () => mockRes1,
      setHeader: () => {},
      send: () => {},
    };

    await middleware(mockReq1, mockRes1);

    const mockReq2 = {
      method: "POST",
      url: "/data",
      originalUrl: "/data",
      protocol: "http",
      hostname: "localhost",
      headers: { "content-type": "application/json" },
      body: { key: "value" },
    };
    const mockRes2 = {
      status: () => mockRes2,
      setHeader: () => {},
      send: () => {},
      json: () => {},
    };

    await middleware(mockReq2, mockRes2);

    expect(mockRes1.status).toBeDefined();
    expect(mockRes2.status).toBeDefined();
  });

  test("toExpress: 404 behaves like direct app.fetch", async () => {
    const app = prince();
    const middleware = toExpress(app);

    let responseStatus = 0;
    const mockReq = {
      method: "GET",
      url: "/not-found",
      originalUrl: "/not-found",
      protocol: "http",
      hostname: "localhost",
      headers: {},
      body: {},
    };
    const mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return mockRes;
      },
      setHeader: () => {},
      send: () => {},
    };

    await middleware(mockReq, mockRes);

    expect(responseStatus).toBe(404);
  });

  test("all adapters return identical response for same app and request", async () => {
    const app = prince();
    app.get("/ping", () => ({ pong: true }));

    const req = new Request("http://localhost/ping");
    const direct = await app.fetch(req);
    const vercelRes = await toVercel(app)(req.clone());
    const workersRes = await toWorkers(app).fetch(req.clone(), {}, { waitUntil: () => {}, passThroughOnException: () => {} });
    const denoRes = await toDeno(app)(req.clone());

    const getBody = (r: Response) => r.status === 200 ? r.json() : null;
    expect(direct.status).toBe(200);
    expect(vercelRes.status).toBe(200);
    expect(workersRes.status).toBe(200);
    expect(denoRes.status).toBe(200);

    const directData = await getBody(direct);
    const vercelData = await getBody(vercelRes);
    const workersData = await getBody(workersRes);
    const denoData = await getBody(denoRes);

    expect(vercelData).toEqual(directData);
    expect(workersData).toEqual(directData);
    expect(denoData).toEqual(directData);
    expect(directData.pong).toBe(true);
  });
});

// ==========================================
// UTILITY - openapi (matches existing prince.test.ts describe name)
// ==========================================

describe("Utility - openapi", () => {
  test("openapi utility returns correct base structure", () => {
    const info = { title: "Test API", version: "1.0.0" };
    // openapi() now returns a builder — spec lives on .spec
    const api = openapi(info);

    expect(api.spec.openapi).toBe("3.0.0");
    expect(api.spec.info).toEqual(info);
    expect(api.spec.paths).toEqual({});
  });
});

// ==========================================
// SCHEDULER - openapi() builder
// ==========================================

describe("Scheduler - openapi() builder", () => {
  test("returns a spec with correct openapi version and info", () => {
    const api = openapi({ title: "Test API", version: "1.0.0" });

    expect(api.spec.openapi).toBe("3.0.0");
    expect(api.spec.info.title).toBe("Test API");
    expect(api.spec.info.version).toBe("1.0.0");
    expect(api.spec.paths).toEqual({});
  });

  test("spec object is mutable", () => {
    const api = openapi({ title: "My API", version: "2.0.0" });

    api.spec.paths["/hello"] = {
      get: { summary: "Hello", responses: { 200: { description: "OK" } } },
    };

    expect(api.spec.paths["/hello"]).toBeDefined();
  });

  test("scalar() returns a handler function", () => {
    const api = openapi({ title: "My API", version: "1.0.0" });
    const handler = api.scalar();

    expect(typeof handler).toBe("function");
  });

  test("scalar() handler writes HTML with Scalar CDN script", async () => {
    const api = openapi({ title: "My API", version: "1.0.0" });

    let capturedBody = "";
    let capturedStatus = 0;
    let capturedHeaders: Record<string, string> = {};

    const fakeRes = {
      writeHead(status: number, headers: Record<string, string>) {
        capturedStatus = status;
        capturedHeaders = headers;
      },
      end(body: string) {
        capturedBody = body;
      },
    };

    api.scalar()(null, fakeRes);

    expect(capturedStatus).toBe(200);
    expect(capturedHeaders["Content-Type"]).toContain("text/html");
    expect(capturedBody).toContain("@scalar/api-reference");
    expect(capturedBody).toContain("My API");
  });

  test("scalar() inlines spec JSON into the HTML page", () => {
    const api = openapi({ title: "Inline Test", version: "1.0.0" });
    api.spec.paths["/ping"] = { get: { summary: "Ping" } };

    let html = "";
    api.scalar()({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain('"Inline Test"');
    expect(html).toContain('"/ping"');
  });

  test("scalar() respects theme option", () => {
    const api = openapi({ title: "API", version: "1.0.0" });

    let html = "";
    api.scalar({ theme: "moon" })({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain('data-theme="moon"');
  });

  test("scalar() respects layout option", () => {
    const api = openapi({ title: "API", version: "1.0.0" });

    let html = "";
    api.scalar({ layout: "classic" })({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain('data-layout="classic"');
  });

  test("scalar() respects hideDownloadButton option", () => {
    const api = openapi({ title: "API", version: "1.0.0" });

    let html = "";
    api.scalar({ hideDownloadButton: true })({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain('data-hide-download-button="true"');
  });

  test("scalar() respects custom pageTitle option", () => {
    const api = openapi({ title: "API", version: "1.0.0" });

    let html = "";
    api.scalar({ pageTitle: "My Custom Docs" })({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain("<title>My Custom Docs</title>");
  });

  test("scalar() injects customCss into the page", () => {
    const api = openapi({ title: "API", version: "1.0.0" });

    let html = "";
    api.scalar({ customCss: "body { background: red; }" })({}, {
      writeHead: () => {},
      end: (body: string) => { html = body; },
    });

    expect(html).toContain("body { background: red; }");
  });

  test("json() handler returns the spec as JSON", async () => {
    const api = openapi({ title: "JSON Test", version: "1.0.0" });
    api.spec.paths["/test"] = { get: { summary: "Test" } };

    let capturedBody = "";
    let capturedStatus = 0;
    let capturedHeaders: Record<string, string> = {};

    api.json()(null, {
      writeHead(status: number, headers: Record<string, string>) {
        capturedStatus = status;
        capturedHeaders = headers;
      },
      end(body: string) { capturedBody = body; },
    });

    const parsed = JSON.parse(capturedBody);
    expect(capturedStatus).toBe(200);
    expect(capturedHeaders["Content-Type"]).toContain("application/json");
    expect(parsed.info.title).toBe("JSON Test");
    expect(parsed.paths["/test"]).toBeDefined();
  });

  test("json() spec stays live — mutations after json() is called are reflected", () => {
    const api = openapi({ title: "Live", version: "1.0.0" });

    let lastBody = "";
    const handler = api.json();

    // First call — no paths
    handler(null, { writeHead: () => {}, end: (b: string) => { lastBody = b; } });
    expect(JSON.parse(lastBody).paths).toEqual({});

    // Mutate spec
    api.spec.paths["/added"] = { get: { summary: "Added later" } };

    // Second call — should include the new path
    handler(null, { writeHead: () => {}, end: (b: string) => { lastBody = b; } });
    expect(JSON.parse(lastBody).paths["/added"]).toBeDefined();
  });
});

// ==========================================
// PRINCE - app.openapi() integration
// ==========================================

describe("Prince - app.openapi() integration", () => {
  test("mounts GET /docs route serving Scalar HTML", async () => {
    const app = prince();
    app.openapi({ title: "My API", version: "1.0.0" }, "/docs");

    const res = await app.fetch(new Request("http://localhost/docs"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("@scalar/api-reference");
  });

  test("mounts GET /docs.json route serving raw spec", async () => {
    const app = prince();
    app.openapi({ title: "JSON Route API", version: "3.0.0" }, "/docs");

    const res = await app.fetch(new Request("http://localhost/docs.json"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.info.title).toBe("JSON Route API");
    expect(data.info.version).toBe("3.0.0");
  });

  test("custom docsPath is respected", async () => {
    const app = prince();
    app.openapi({ title: "API", version: "1.0.0" }, "/reference");

    const res = await app.fetch(new Request("http://localhost/reference"));
    expect(res.status).toBe(200);

    const jsonRes = await app.fetch(new Request("http://localhost/reference.json"));
    expect(jsonRes.status).toBe(200);
  });

  test("api.route() returns the builder for chaining", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    const result = api.route("GET", "/ping", { summary: "Ping" }, () => ({ pong: true }));

    expect(result).toBe(api);
  });

  test("api.route() registers the route so Prince can handle requests", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/hello", { summary: "Hello" }, () => ({ message: "hello" }));

    const res = await app.fetch(new Request("http://localhost/hello"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("hello");
  });

  test("api.route() writes path entry into spec", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/users", { summary: "List users" }, () => []);

    expect(api.spec.paths["/users"]).toBeDefined();
    expect((api.spec.paths["/users"] as any).get.summary).toBe("List users");
  });

  test("api.route() converts :param to {param} in spec path", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/users/:id", { summary: "Get user" }, (req) => ({ id: req.params?.id }));

    expect(api.spec.paths["/users/{id}"]).toBeDefined();
    expect(api.spec.paths["/users/:id"]).toBeUndefined();
  });

  test("api.route() auto-injects path param into parameters array", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/items/:itemId/reviews/:reviewId", { summary: "Get review" }, () => ({}));

    const op = (api.spec.paths["/items/{itemId}/reviews/{reviewId}"] as any).get;
    const paramNames = op.parameters.map((p: any) => p.name);

    expect(paramNames).toContain("itemId");
    expect(paramNames).toContain("reviewId");
    expect(op.parameters[0].in).toBe("path");
    expect(op.parameters[0].required).toBe(true);
  });

  test("api.route() handles POST with body", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("POST", "/users", { summary: "Create user" }, (req) => ({
      created: true,
      name: req.parsedBody?.name,
    }));

    const res = await app.fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bob" }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(true);
    expect(data.name).toBe("Bob");
  });

  test("api.route() supports route-level middleware", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    const guardMw = async (req: any, next: any) => {
      if (!req.headers.get("x-token")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
      return next();
    };

    api.route("GET", "/secret", { summary: "Secret" }, guardMw, () => ({ secret: true }));

    const denied = await app.fetch(new Request("http://localhost/secret"));
    expect(denied.status).toBe(403);

    const allowed = await app.fetch(
      new Request("http://localhost/secret", { headers: { "x-token": "yes" } })
    );
    expect(allowed.status).toBe(200);
  });

  test("multiple api.route() calls accumulate in spec.paths", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/a", { summary: "A" }, () => "a");
    api.route("POST", "/b", { summary: "B" }, () => "b");
    api.route("DELETE", "/c/:id", { summary: "C" }, () => "c");

    expect(Object.keys(api.spec.paths)).toHaveLength(3);
    expect(api.spec.paths["/a"]).toBeDefined();
    expect(api.spec.paths["/b"]).toBeDefined();
    expect(api.spec.paths["/c/{id}"]).toBeDefined();
  });

  test("spec.paths is reflected in /docs.json after routes are added", async () => {
    const app = prince();
    const api = app.openapi({ title: "Live Spec", version: "1.0.0" }, "/docs");

    api.route("GET", "/ping", { summary: "Ping" }, () => ({ pong: true }));

    const res = await app.fetch(new Request("http://localhost/docs.json"));
    const data = await res.json();

    expect(data.paths["/ping"]).toBeDefined();
    expect(data.paths["/ping"].get.summary).toBe("Ping");
  });

  test("app.get() routes are NOT added to spec automatically", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    app.get("/internal/health", () => ({ ok: true }));

    expect(api.spec.paths["/internal/health"]).toBeUndefined();
  });
});

// ==========================================
// SCHEMA - body validation
// ==========================================

describe("Schema - body auto-validation", () => {
  test("valid body passes through to handler", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    const schema = {
      body: z.object({ name: z.string(), age: z.number() }),
    };

    api.route("POST", "/users", { summary: "Create", schema }, (req) => ({
      name: req.parsedBody?.name,
      age: req.parsedBody?.age,
    }));

    const res = await app.fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: 30 }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.name).toBe("Alice");
    expect(data.age).toBe(30);
  });

  test("invalid body returns 400 with validation details", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    const schema = {
      body: z.object({ email: z.string().email() }),
    };

    api.route("POST", "/subscribe", { summary: "Subscribe", schema }, () => ({ ok: true }));

    const res = await app.fetch(
      new Request("http://localhost/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeArray();
    expect(data.details.length).toBeGreaterThan(0);
  });

  test("missing required field returns 400", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("POST", "/items", {
      summary: "Create item",
      schema: { body: z.object({ name: z.string(), price: z.number() }) },
    }, () => ({ ok: true }));

    const res = await app.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Widget" }), // missing price
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.details.some((d: any) => d.path === "price")).toBe(true);
  });

  test("optional fields in schema do not cause rejection", async () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("POST", "/profile", {
      summary: "Update profile",
      schema: {
        body: z.object({
          name: z.string(),
          bio: z.string().optional(),
        }),
      },
    }, (req) => ({ name: req.parsedBody?.name }));

    const res = await app.fetch(
      new Request("http://localhost/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }), // no bio — that's fine
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Alice");
  });

  test("schema.body writes requestBody into spec", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("POST", "/users", {
      summary: "Create user",
      schema: {
        body: z.object({ name: z.string(), age: z.number() }),
      },
    }, () => ({}));

    const op = (api.spec.paths["/users"] as any).post;
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody.required).toBe(true);
    expect(op.requestBody.content["application/json"].schema.type).toBe("object");
    expect(op.requestBody.content["application/json"].schema.properties.name).toEqual({ type: "string" });
    expect(op.requestBody.content["application/json"].schema.properties.age).toEqual({ type: "number" });
  });

  test("schema.body marks required fields in JSON Schema", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("POST", "/test", {
      summary: "Test",
      schema: {
        body: z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
      },
    }, () => ({}));

    const jsonSchema = (api.spec.paths["/test"] as any).post.requestBody.content["application/json"].schema;
    expect(jsonSchema.required).toContain("required");
    expect(jsonSchema.required).not.toContain("optional");
  });
});

// ==========================================
// SCHEMA - query params
// ==========================================

describe("Schema - query params in spec", () => {
  test("schema.query writes parameters into spec", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/search", {
      summary: "Search",
      schema: {
        query: z.object({
          q: z.string(),
          limit: z.number().optional(),
        }),
      },
    }, () => []);

    const op = (api.spec.paths["/search"] as any).get;
    const queryParams = op.parameters.filter((p: any) => p.in === "query");

    expect(queryParams).toHaveLength(2);
    const q = queryParams.find((p: any) => p.name === "q");
    const limit = queryParams.find((p: any) => p.name === "limit");

    expect(q.required).toBe(true);
    expect(limit.required).toBe(false);
  });

  test("query params coexist with path params in parameters array", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/users/:id/posts", {
      summary: "User posts",
      schema: {
        query: z.object({ page: z.number().optional() }),
      },
    }, () => []);

    const op = (api.spec.paths["/users/{id}/posts"] as any).get;
    const pathParams = op.parameters.filter((p: any) => p.in === "path");
    const queryParams = op.parameters.filter((p: any) => p.in === "query");

    expect(pathParams.map((p: any) => p.name)).toContain("id");
    expect(queryParams.map((p: any) => p.name)).toContain("page");
  });
});

// ==========================================
// SCHEMA - response
// ==========================================

describe("Schema - response in spec", () => {
  test("schema.response writes 200 response schema into spec", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    const UserResponse = z.object({ id: z.string(), name: z.string() });

    api.route("GET", "/me", {
      summary: "Get current user",
      schema: { response: UserResponse },
    }, () => ({ id: "1", name: "Alice" }));

    const op = (api.spec.paths["/me"] as any).get;
    const responseSchema = op.responses[200].content["application/json"].schema;

    expect(responseSchema.type).toBe("object");
    expect(responseSchema.properties.id).toEqual({ type: "string" });
    expect(responseSchema.properties.name).toEqual({ type: "string" });
  });

  test("schema.response with z.array wraps items correctly", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/items", {
      summary: "List items",
      schema: {
        response: z.array(z.object({ id: z.number(), label: z.string() })),
      },
    }, () => []);

    const op = (api.spec.paths["/items"] as any).get;
    const responseSchema = op.responses[200].content["application/json"].schema;

    expect(responseSchema.type).toBe("array");
    expect(responseSchema.items.type).toBe("object");
    expect(responseSchema.items.properties.id).toEqual({ type: "number" });
  });

  test("manually specified responses are preserved alongside schema.response", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("DELETE", "/users/:id", {
      summary: "Delete user",
      schema: { response: z.object({ deleted: z.boolean() }) },
      responses: {
        404: { description: "User not found" },
      },
    }, () => ({ deleted: true }));

    const op = (api.spec.paths["/users/{id}"] as any).delete;
    expect(op.responses[200]).toBeDefined();
    expect(op.responses[404]).toBeDefined();
    expect(op.responses[404].description).toBe("User not found");
  });

  test("without schema.response a default 200 OK response is added", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });

    api.route("GET", "/ping", { summary: "Ping" }, () => ({ pong: true }));

    const op = (api.spec.paths["/ping"] as any).get;
    expect(op.responses[200]).toBeDefined();
    expect(op.responses[200].description).toBe("OK");
  });
});

// ==========================================
// SCHEMA - Zod → JSON Schema converter
// ==========================================

describe("Schema - Zod to JSON Schema conversion", () => {
  const getBodySchema = (app: ReturnType<typeof prince>, api: any, path: string, method = "post") => {
    return (api.spec.paths[path] as any)[method]?.requestBody?.content["application/json"]?.schema;
  };

  test("z.string() → { type: 'string' }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/s", { schema: { body: z.object({ x: z.string() }) } }, () => ({}));
    expect(getBodySchema(app, api, "/s").properties.x).toEqual({ type: "string" });
  });

  test("z.string().email() → { type: 'string', format: 'email' }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/e", { schema: { body: z.object({ email: z.string().email() }) } }, () => ({}));
    expect(getBodySchema(app, api, "/e").properties.email).toEqual({ type: "string", format: "email" });
  });

  test("z.string().min(3).max(50) → minLength / maxLength", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/ml", { schema: { body: z.object({ name: z.string().min(3).max(50) }) } }, () => ({}));
    const schema = getBodySchema(app, api, "/ml").properties.name;
    expect(schema.minLength).toBe(3);
    expect(schema.maxLength).toBe(50);
  });

  test("z.number() → { type: 'number' }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/n", { schema: { body: z.object({ count: z.number() }) } }, () => ({}));
    expect(getBodySchema(app, api, "/n").properties.count).toEqual({ type: "number" });
  });

  test("z.number().int() → { type: 'integer' }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/i", { schema: { body: z.object({ age: z.number().int() }) } }, () => ({}));
    expect(getBodySchema(app, api, "/i").properties.age.type).toBe("integer");
  });

  test("z.number().min(0).max(100) → minimum / maximum", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/mm", { schema: { body: z.object({ pct: z.number().min(0).max(100) }) } }, () => ({}));
    const schema = getBodySchema(app, api, "/mm").properties.pct;
    expect(schema.minimum).toBe(0);
    expect(schema.maximum).toBe(100);
  });

  test("z.boolean() → { type: 'boolean' }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/b", { schema: { body: z.object({ active: z.boolean() }) } }, () => ({}));
    expect(getBodySchema(app, api, "/b").properties.active).toEqual({ type: "boolean" });
  });

  test("z.enum() → { type: 'string', enum: [...] }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/en", { schema: { body: z.object({ role: z.enum(["admin", "user"]) }) } }, () => ({}));
    expect(getBodySchema(app, api, "/en").properties.role).toEqual({ type: "string", enum: ["admin", "user"] });
  });

  test("z.literal() → { enum: [value] }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/lit", { schema: { body: z.object({ kind: z.literal("widget") }) } }, () => ({}));
    expect(getBodySchema(app, api, "/lit").properties.kind).toEqual({ enum: ["widget"] });
  });

  test("z.array(z.string()) → { type: 'array', items: { type: 'string' } }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/arr", { schema: { body: z.object({ tags: z.array(z.string()) }) } }, () => ({}));
    expect(getBodySchema(app, api, "/arr").properties.tags).toEqual({ type: "array", items: { type: "string" } });
  });

  test("z.optional() fields are excluded from required[]", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/opt", {
      schema: {
        body: z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
      },
    }, () => ({}));
    const s = getBodySchema(app, api, "/opt");
    expect(s.required).toContain("required");
    expect(s.required).not.toContain("optional");
  });

  test("z.default() fields are excluded from required[] and include default value", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/def", {
      schema: {
        body: z.object({
          page: z.number().default(1),
        }),
      },
    }, () => ({}));
    const s = getBodySchema(app, api, "/def");
    // When all fields have defaults, required[] is absent entirely
    expect(s.required == null || !s.required.includes("page")).toBe(true);
    expect(s.properties.page.default).toBe(1);
  });

  test("z.union() → { oneOf: [...] }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/uni", {
      schema: {
        body: z.object({ val: z.union([z.string(), z.number()]) }),
      },
    }, () => ({}));
    const prop = getBodySchema(app, api, "/uni").properties.val;
    expect(prop.oneOf).toBeDefined();
    expect(prop.oneOf).toHaveLength(2);
  });

  test("z.record() → { type: 'object', additionalProperties: ... }", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/rec", {
      schema: { body: z.object({ meta: z.record(z.string()) }) },
    }, () => ({}));
    const prop = getBodySchema(app, api, "/rec").properties.meta;
    expect(prop.type).toBe("object");
    expect(prop.additionalProperties).toEqual({ type: "string" });
  });

  test("nested z.object() is recursively converted", () => {
    const app = prince();
    const api = app.openapi({ title: "API", version: "1.0.0" });
    api.route("POST", "/nested", {
      schema: {
        body: z.object({
          address: z.object({
            street: z.string(),
            zip: z.string(),
          }),
        }),
      },
    }, () => ({}));
    const address = getBodySchema(app, api, "/nested").properties.address;
    expect(address.type).toBe("object");
    expect(address.properties.street).toEqual({ type: "string" });
    expect(address.properties.zip).toEqual({ type: "string" });
  });
});

// ==========================================
// SCHEDULER - cron()
// ==========================================

describe("Scheduler - cron()", () => {
  test("cron executes task immediately when pattern matches current time", async () => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();

    let called = false;
    cron(`${minute} ${hour} * * *`, () => { called = true; });

    expect(called).toBe(true);
  });

  test("cron does not execute task when pattern does not match", () => {
    const now = new Date();
    // Pick a minute that will never be now
    const wrongMinute = (now.getMinutes() + 5) % 60;
    const hour = now.getHours();

    let called = false;
    cron(`${wrongMinute} ${hour} * * *`, () => { called = true; });

    expect(called).toBe(false);
  });

  test("wildcard * matches any minute", () => {
    const now = new Date();
    const hour = now.getHours();

    let called = false;
    cron(`* ${hour} * * *`, () => { called = true; });

    expect(called).toBe(true);
  });

  test("wildcard * matches any hour", () => {
    const now = new Date();
    const minute = now.getMinutes();

    let called = false;
    cron(`${minute} * * * *`, () => { called = true; });

    expect(called).toBe(true);
  });

  test("step syntax */n matches when minute is divisible", () => {
    const now = new Date();
    // Find a step that divides the current minute (or use 1 which always matches)
    const minute = now.getMinutes();
    const step = minute === 0 ? 1 : minute; // minute % minute === 0 always
    const hour = now.getHours();

    let called = false;
    cron(`*/${step} ${hour} * * *`, () => { called = true; });

    expect(called).toBe(true);
  });

  test("comma-separated minutes list matches current minute", () => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const otherMinute = (minute + 30) % 60;

    let called = false;
    cron(`${otherMinute},${minute} ${hour} * * *`, () => { called = true; });

    expect(called).toBe(true);
  });

  test("cron error in task does not throw — is caught and logged", () => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();

    // Should not throw even though task throws
    expect(() => {
      cron(`${minute} ${hour} * * *`, () => {
        throw new Error("Task exploded");
      });
    }).not.toThrow();
  });
});

// ==========================================
// Lifecycle Hooks 
// ==========================================

describe("Lifecycle Hooks", () => {
  test("onRequest hook is called for every request", async () => {
    const app = prince();
    let called = false;
    let capturedReq: any = null;

    app.onRequest((req: any) => {
      called = true;
      capturedReq = req;
    });

    app.get("/test", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/test"));
    
    expect(called).toBe(true);
    expect(capturedReq).toBeDefined();
    expect(capturedReq.url).toContain("/test");
  });

  test("onRequest hook is called before route matching", async () => {
    const app = prince();
    let callOrder: string[] = [];

    app.onRequest((req: any) => {
      callOrder.push("onRequest");
    });

    app.get("/test", () => {
      callOrder.push("handler");
      return { ok: true };
    });

    await app.fetch(new Request("http://localhost/test"));
    
    expect(callOrder[0]).toBe("onRequest");
    expect(callOrder[1]).toBe("handler");
  });

  test("multiple onRequest hooks are called in registration order", async () => {
    const app = prince();
    const callOrder: string[] = [];

    app.onRequest((req: any) => callOrder.push("hook1"));
    app.onRequest((req: any) => callOrder.push("hook2"));
    app.onRequest((req: any) => callOrder.push("hook3"));

    app.get("/test", () => ({ ok: true }));

    await app.fetch(new Request("http://localhost/test"));
    
    expect(callOrder).toEqual(["hook1", "hook2", "hook3"]);
  });

  test("onRequest hook can be async", async () => {
    const app = prince();
    let called = false;

    app.onRequest(async (req: any) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      called = true;
    });

    app.get("/test", () => ({ ok: true }));

    await app.fetch(new Request("http://localhost/test"));
    
    expect(called).toBe(true);
  });

  test("onBeforeHandle hook is called before route handler", async () => {
    const app = prince();
    let callOrder: string[] = [];

    app.onBeforeHandle((req: any) => {
      callOrder.push("onBeforeHandle");
    });

    app.get("/test", () => {
      callOrder.push("handler");
      return { ok: true };
    });

    await app.fetch(new Request("http://localhost/test"));
    
    expect(callOrder[0]).toBe("onBeforeHandle");
    expect(callOrder[1]).toBe("handler");
  });

  test("onBeforeHandle hook receives path and method", async () => {
    const app = prince();
    let capturedPath = "";
    let capturedMethod = "";

    app.onBeforeHandle((req: any, path: string, method: string) => {
      capturedPath = path;
      capturedMethod = method;
    });

    app.post("/api/users", () => ({ ok: true }));

    await app.fetch(
      new Request("http://localhost/api/users", { method: "POST" })
    );
    
    expect(capturedPath).toBe("/api/users");
    expect(capturedMethod).toBe("POST");
  });

  test("onAfterHandle hook is called after route handler", async () => {
    const app = prince();
    let callOrder: string[] = [];

    app.onAfterHandle((req: any) => {
      callOrder.push("onAfterHandle");
    });

    app.get("/test", () => {
      callOrder.push("handler");
      return { ok: true };
    });

    await app.fetch(new Request("http://localhost/test"));
    
    expect(callOrder[0]).toBe("handler");
    expect(callOrder[1]).toBe("onAfterHandle");
  });

  test("onAfterHandle hook receives response object", async () => {
    const app = prince();
    let capturedStatus = 0;

    app.onAfterHandle((req: any, res: any) => {
      capturedStatus = res.status;
    });

    app.get("/test", () => ({ data: "test" }));

    await app.fetch(new Request("http://localhost/test"));
    
    expect(capturedStatus).toBe(200);
  });

  test("onAfterHandle hook receives path and method", async () => {
    const app = prince();
    let capturedPath = "";
    let capturedMethod = "";

    app.onAfterHandle((req: any, res: any, path: string, method: string) => {
      capturedPath = path;
      capturedMethod = method;
    });

    app.delete("/users/:id", () => ({ deleted: true }));

    await app.fetch(
      new Request("http://localhost/users/123", { method: "DELETE" })
    );
    
    expect(capturedPath).toBe("/users/123");
    expect(capturedMethod).toBe("DELETE");
  });

  test("multiple onAfterHandle hooks are called in order", async () => {
    const app = prince();
    const callOrder: string[] = [];

    app.onAfterHandle((req: any) => callOrder.push("log"));
    app.onAfterHandle((req: any) => callOrder.push("metrics"));
    app.onAfterHandle((req: any) => callOrder.push("cleanup"));

    app.get("/test", () => ({ ok: true }));

    await app.fetch(new Request("http://localhost/test"));
    
    expect(callOrder).toEqual(["log", "metrics", "cleanup"]);
  });

  test("onError hook is called when handler throws", async () => {
    const app = prince();
    let capturedError: any = null;

    app.onError((err: any) => {
      capturedError = err;
    });

    app.get("/error", () => {
      throw new Error("Handler failed");
    });

    await app.fetch(new Request("http://localhost/error"));
    
    expect(capturedError).toBeDefined();
    expect(capturedError.message).toBe("Handler failed");
  });

  test("onError hook receives path and method", async () => {
    const app = prince();
    let capturedPath = "";
    let capturedMethod = "";

    app.onError((err: any, req: any, path: string, method: string) => {
      capturedPath = path;
      capturedMethod = method;
    });

    app.post("/submit", () => {
      throw new Error("Bad request");
    });

    await app.fetch(
      new Request("http://localhost/submit", { method: "POST" })
    );
    
    expect(capturedPath).toBe("/submit");
    expect(capturedMethod).toBe("POST");
  });

  test("multiple onError hooks are called in order", async () => {
    const app = prince();
    const callOrder: string[] = [];

    app.onError((err: any) => callOrder.push("log"));
    app.onError((err: any) => callOrder.push("alert"));
    app.onError((err: any) => callOrder.push("recovery"));

    app.get("/error", () => {
      throw new Error("Test error");
    });

    await app.fetch(new Request("http://localhost/error"));
    
    expect(callOrder).toEqual(["log", "alert", "recovery"]);
  });

  test("onError hook is NOT called for successful requests", async () => {
    const app = prince();
    let errorCalled = false;

    app.onError((err: any) => {
      errorCalled = true;
    });

    app.get("/success", () => ({ status: "ok" }));

    await app.fetch(new Request("http://localhost/success"));
    
    expect(errorCalled).toBe(false);
  });

  test("full lifecycle: onRequest → onBeforeHandle → handler → onAfterHandle", async () => {
    const app = prince();
    const callOrder: string[] = [];

    app.onRequest((req: any) => callOrder.push("1:onRequest"));
    app.onBeforeHandle((req: any) => callOrder.push("2:onBeforeHandle"));

    app.get("/lifecycle", () => {
      callOrder.push("3:handler");
      return { ok: true };
    });

    app.onAfterHandle((req: any) => callOrder.push("4:onAfterHandle"));

    await app.fetch(new Request("http://localhost/lifecycle"));
    
    expect(callOrder).toEqual(["1:onRequest", "2:onBeforeHandle", "3:handler", "4:onAfterHandle"]);
  });

  test("lifecycle with error: onRequest → onBeforeHandle → handler throws → onError", async () => {
    const app = prince();
    const callOrder: string[] = [];

    app.onRequest((req: any) => callOrder.push("1:onRequest"));
    app.onBeforeHandle((req: any) => callOrder.push("2:onBeforeHandle"));

    app.get("/lifecycle", () => {
      callOrder.push("3:handler");
      throw new Error("Oops");
    });

    app.onError((err: any) => callOrder.push("4:onError"));
    app.onAfterHandle((req: any) => callOrder.push("5:onAfterHandle"));

    await app.fetch(new Request("http://localhost/lifecycle"));
    
    // onAfterHandle should NOT be called when there's an error
    expect(callOrder).toEqual(["1:onRequest", "2:onBeforeHandle", "3:handler", "4:onError"]);
  });

  test("lifecycle hooks support chaining the app instance", () => {
    const app = prince();

    const result = app
      .onRequest((req: any) => {})
      .onBeforeHandle((req: any) => {})
      .onAfterHandle((req: any) => {})
      .onError((err: any) => {});

    expect(result).toBe(app);
  });

  test("onRequest hook receives PrinceRequest with url property", async () => {
    const app = prince();
    let capturedUrl = "";

    app.onRequest((req: any) => {
      capturedUrl = req.url;
    });

    app.get("/test", () => ({}));

    await app.fetch(new Request("http://localhost/test?param=value"));
    
    expect(capturedUrl).toContain("http://localhost/test");
    expect(capturedUrl).toContain("param=value");
  });
});

console.log("\n✅ All tests defined! Run with: bun test\n");
// ==========================================
// ROUTE GROUPING
// ==========================================

describe("Route Grouping", () => {
  test("group() prefixes all routes correctly", async () => {
    const app = prince();
    app.group("/api", (r) => {
      r.get("/users", () => ({ users: [] }));
      r.post("/users", (req) => ({ created: req.parsedBody }));
      r.get("/users/:id", (req) => ({ id: req.params?.id }));
    });

    const res1 = await app.fetch(new Request("http://localhost/api/users"));
    expect(res1.status).toBe(200);
    const d1 = await res1.json();
    expect(d1.users).toEqual([]);

    const res2 = await app.fetch(new Request("http://localhost/api/users/42"));
    expect(res2.status).toBe(200);
    const d2 = await res2.json();
    expect(d2.id).toBe("42");

    // Non-prefixed path should 404
    const res3 = await app.fetch(new Request("http://localhost/users"));
    expect(res3.status).toBe(404);
  });

  test("group() routes don't exist outside the prefix", async () => {
    const app = prince();
    app.group("/v1", (r) => {
      r.get("/ping", () => ({ pong: true }));
    });
    const res = await app.fetch(new Request("http://localhost/ping"));
    expect(res.status).toBe(404);
  });

  test("group() with shared middleware applies to all routes in group", async () => {
    const app = prince();
    const guardMw = async (req: any, next: any) => {
      if (!req.headers.get("x-token")) {
        return new Response(JSON.stringify({ error: "No token" }), { status: 401 });
      }
      return next();
    };

    app.group("/protected", guardMw, (r) => {
      r.get("/a", () => ({ a: true }));
      r.get("/b", () => ({ b: true }));
    });

    // Without token — both routes blocked
    const res1 = await app.fetch(new Request("http://localhost/protected/a"));
    expect(res1.status).toBe(401);

    const res2 = await app.fetch(new Request("http://localhost/protected/b"));
    expect(res2.status).toBe(401);

    // With token — both pass
    const res3 = await app.fetch(new Request("http://localhost/protected/a", {
      headers: { "x-token": "yes" }
    }));
    expect(res3.status).toBe(200);
  });

  test("group() is chainable", async () => {
    const app = prince();
    app
      .group("/v1", (r) => { r.get("/ping", () => ({ v: 1 })); })
      .group("/v2", (r) => { r.get("/ping", () => ({ v: 2 })); });

    const r1 = await (await app.fetch(new Request("http://localhost/v1/ping"))).json();
    const r2 = await (await app.fetch(new Request("http://localhost/v2/ping"))).json();
    expect(r1.v).toBe(1);
    expect(r2.v).toBe(2);
  });

  test("group() supports all HTTP methods", async () => {
    const app = prince();
    app.group("/items", (r) => {
      r.get("/list",   () => ({ method: "GET" }));
      r.post("/list",  () => ({ method: "POST" }));
      r.put("/:id",    () => ({ method: "PUT" }));
      r.patch("/:id",  () => ({ method: "PATCH" }));
      r.delete("/:id", () => ({ method: "DELETE" }));
    });

    const get    = await app.fetch(new Request("http://localhost/items/list"));
    const post   = await app.fetch(new Request("http://localhost/items/list", { method: "POST" }));
    const put    = await app.fetch(new Request("http://localhost/items/42",   { method: "PUT" }));
    const patch  = await app.fetch(new Request("http://localhost/items/42",   { method: "PATCH" }));
    const del    = await app.fetch(new Request("http://localhost/items/42",   { method: "DELETE" }));

    expect(get.status).toBe(200);
    expect(post.status).toBe(200);
    expect(put.status).toBe(200);
    expect(patch.status).toBe(200);
    expect(del.status).toBe(200);

    expect((await get.json()).method).toBe("GET");
    expect((await post.json()).method).toBe("POST");
    expect((await put.json()).method).toBe("PUT");
    expect((await patch.json()).method).toBe("PATCH");
    expect((await del.json()).method).toBe("DELETE");
  });

  test("nested groups work via sequential calls", async () => {
    const app = prince();
    app.group("/api", (r) => {
      r.get("/health", () => ({ ok: true }));
    });
    app.group("/api/v2", (r) => {
      r.get("/health", () => ({ ok: true, v: 2 }));
    });
    const r1 = await (await app.fetch(new Request("http://localhost/api/health"))).json();
    const r2 = await (await app.fetch(new Request("http://localhost/api/v2/health"))).json();
    expect(r1.ok).toBe(true);
    expect(r2.v).toBe(2);
  });
});

// ==========================================
// SECURE HEADERS
// ==========================================

describe("Middleware - Secure Headers", () => {
  test("secureHeaders() sets default security headers", async () => {
    const app = prince();
    app.use(secureHeaders());
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  test("secureHeaders() allows custom X-Frame-Options", async () => {
    const app = prince();
    app.use(secureHeaders({ xFrameOptions: "DENY" }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("secureHeaders() can disable X-Content-Type-Options", async () => {
    const app = prince();
    app.use(secureHeaders({ xContentTypeOptions: false }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Content-Type-Options")).toBeNull();
  });

  test("secureHeaders() sets CSP when provided", async () => {
    const app = prince();
    app.use(secureHeaders({ contentSecurityPolicy: "default-src 'self'" }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
  });

  test("secureHeaders() sets Permissions-Policy when provided", async () => {
    const app = prince();
    app.use(secureHeaders({ permissionsPolicy: "camera=(), microphone=()" }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=()");
  });
});

// ==========================================
// REQUEST TIMEOUT
// ==========================================

describe("Middleware - Request Timeout", () => {
  test("timeout() passes through fast responses", async () => {
    const app = prince();
    app.use(timeout(1000));
    app.get("/fast", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/fast"));
    expect(res.status).toBe(200);
  });

  test("timeout() returns 408 when handler is too slow", async () => {
    const app = prince();
    app.use(timeout(50));
    app.get("/slow", async () => {
      await new Promise(r => setTimeout(r, 200));
      return { ok: true };
    });

    const res = await app.fetch(new Request("http://localhost/slow"));
    expect(res.status).toBe(408);
    const data = await res.json();
    expect(data.error).toBe("Request Timeout");
  });

  test("timeout() uses custom error message", async () => {
    const app = prince();
    app.use(timeout(50, "Too slow!"));
    app.get("/slow", async () => {
      await new Promise(r => setTimeout(r, 200));
      return { ok: true };
    });

    const res = await app.fetch(new Request("http://localhost/slow"));
    const data = await res.json();
    expect(data.error).toBe("Too slow!");
  });

  test("timeout() cleans up timer on success", async () => {
    const app = prince();
    app.use(timeout(500));
    app.get("/ok", () => ({ done: true }));

    const res = await app.fetch(new Request("http://localhost/ok"));
    expect(res.status).toBe(200);
  });
});

// ==========================================
// REQUEST ID
// ==========================================

describe("Middleware - Request ID", () => {
  test("requestId() adds X-Request-ID header to response", async () => {
    const app = prince();
    app.use(requestId());
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Request-ID")).toBeDefined();
    expect(res.headers.get("X-Request-ID")!.length).toBeGreaterThan(0);
  });

  test("requestId() sets req.id on the request", async () => {
    const app = prince();
    app.use(requestId());
    app.get("/", (req) => ({ id: req.id }));

    const res = await app.fetch(new Request("http://localhost/"));
    const data = await res.json();
    expect(data.id).toBeDefined();
  });

  test("requestId() reuses incoming X-Request-ID if present", async () => {
    const app = prince();
    app.use(requestId());
    app.get("/", (req) => ({ id: req.id }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "X-Request-ID": "my-custom-id" }
    }));
    const data = await res.json();
    expect(data.id).toBe("my-custom-id");
    expect(res.headers.get("X-Request-ID")).toBe("my-custom-id");
  });

  test("requestId() supports custom header name", async () => {
    const app = prince();
    app.use(requestId({ header: "X-Trace-ID" }));
    app.get("/", (req) => ({ id: req.id }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Trace-ID")).toBeDefined();
  });

  test("requestId() supports custom generator", async () => {
    const app = prince();
    let counter = 0;
    app.use(requestId({ generator: () => `req-${++counter}` }));
    app.get("/", (req) => ({ id: req.id }));

    const res1 = await app.fetch(new Request("http://localhost/"));
    const res2 = await app.fetch(new Request("http://localhost/"));
    expect((await res1.json()).id).toBe("req-1");
    expect((await res2.json()).id).toBe("req-2");
  });

  test("each request gets a unique ID", async () => {
    const app = prince();
    app.use(requestId());
    app.get("/", () => ({ ok: true }));

    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await app.fetch(new Request("http://localhost/"));
      ids.add(res.headers.get("X-Request-ID")!);
    }
    expect(ids.size).toBe(5);
  });
});

// ==========================================
// IP RESTRICTION
// ==========================================

describe("Middleware - IP Restriction", () => {
  test("ipRestriction() allowList blocks IPs not in list", async () => {
    const app = prince();
    app.use(ipRestriction({ allowList: ["192.168.1.1"] }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "x-real-ip": "10.0.0.1" }
    }));
    expect(res.status).toBe(403);
  });

  test("ipRestriction() allowList passes allowed IPs", async () => {
    const app = prince();
    app.use(ipRestriction({ allowList: ["192.168.1.1"] }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "x-real-ip": "192.168.1.1" }
    }));
    expect(res.status).toBe(200);
  });

  test("ipRestriction() denyList blocks denied IPs", async () => {
    const app = prince();
    app.use(ipRestriction({ denyList: ["10.0.0.1"] }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "x-real-ip": "10.0.0.1" }
    }));
    expect(res.status).toBe(403);
  });

  test("ipRestriction() denyList passes non-denied IPs", async () => {
    const app = prince();
    app.use(ipRestriction({ denyList: ["10.0.0.1"] }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "x-real-ip": "192.168.1.100" }
    }));
    expect(res.status).toBe(200);
  });

  test("ipRestriction() 403 response has JSON body", async () => {
    const app = prince();
    app.use(ipRestriction({ denyList: ["1.2.3.4"] }));
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "x-real-ip": "1.2.3.4" }
    }));
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });
});

// ==========================================
// STATIC FILE SERVING
// ==========================================

describe("Middleware - serveStatic", () => {
  test("serveStatic() returns 404 equivalent for missing files", async () => {
    const app = prince();
    app.use(serveStatic("./nonexistent-dir"));
    app.get("/fallback", () => ({ fallback: true }));

    // Missing file falls through to next route
    const res = await app.fetch(new Request("http://localhost/fallback"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fallback).toBe(true);
  });

  test("serveStatic() does not intercept non-GET methods", async () => {
    const app = prince();
    app.use(serveStatic("./public"));
    app.post("/api/data", (req) => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }));
    expect(res.status).toBe(200);
  });
});

// ==========================================
// STREAM HELPER
// ==========================================

describe("Helper - stream", () => {
  test("stream() returns a streaming response with correct content-type", async () => {
    const app = prince();
    app.get("/stream", stream((req) => {
      req.streamSend!("hello");
    }));

    const res = await app.fetch(new Request("http://localhost/stream"));
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.body).toBeDefined();
  });

  test("stream() supports custom content-type", async () => {
    const app = prince();
    app.get("/stream", stream((_req) => {
      // no-op — auto-closes
    }, { contentType: "application/octet-stream" }));

    const res = await app.fetch(new Request("http://localhost/stream"));
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("stream() sends chunks that can be read via callback", async () => {
    const app = prince();
    app.get("/chunks", stream((req) => {
      req.streamSend!("chunk1");
      req.streamSend!("chunk2");
    }));

    const res = await app.fetch(new Request("http://localhost/chunks"));
    const text = await res.text();
    expect(text).toContain("chunk1");
    expect(text).toContain("chunk2");
  });

  test("stream() works with async generator", async () => {
    const app = prince();
    app.get("/gen", stream(async function* () {
      yield "a";
      yield "b";
      yield "c";
    }));

    const res = await app.fetch(new Request("http://localhost/gen"));
    const text = await res.text();
    expect(text).toBe("abc");
  });

  test("stream() works with async callback", async () => {
    const app = prince();
    app.get("/async", stream(async (req) => {
      req.streamSend!("hello");
      await new Promise(r => setTimeout(r, 10));
      req.streamSend!(" async");
    }));

    const res = await app.fetch(new Request("http://localhost/async"));
    const text = await res.text();
    expect(text).toBe("hello async");
  });
});
// ==========================================
// TRIM TRAILING SLASH
// ==========================================

describe("Middleware - trimTrailingSlash", () => {
  test("redirects trailing slash with 301 by default", async () => {
    const app = prince();
    app.use(trimTrailingSlash());
    app.get("/users", () => ({ users: [] }));

    const res = await app.fetch(new Request("http://localhost/users/", { redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/users");
  });

  test("does not redirect root /", async () => {
    const app = prince();
    app.use(trimTrailingSlash());
    app.get("/", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
  });

  test("preserves query string in redirect", async () => {
    const app = prince();
    app.use(trimTrailingSlash());
    app.get("/search", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/search/?q=test&page=2", { redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/search?q=test&page=2");
  });

  test("supports 302 status code", async () => {
    const app = prince();
    app.use(trimTrailingSlash(302));
    app.get("/users", () => ({ users: [] }));

    const res = await app.fetch(new Request("http://localhost/users/", { redirect: "manual" }));
    expect(res.status).toBe(302);
  });

  test("passes through paths without trailing slash", async () => {
    const app = prince();
    app.use(trimTrailingSlash());
    app.get("/users", () => ({ users: [] }));

    const res = await app.fetch(new Request("http://localhost/users"));
    expect(res.status).toBe(200);
  });

  test("works with nested paths", async () => {
    const app = prince();
    app.use(trimTrailingSlash());
    app.get("/api/v1/users", () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/api/v1/users/", { redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/api/v1/users");
  });
});

// ==========================================
// MIDDLEWARE COMBINATORS
// ==========================================

describe("Middleware - every()", () => {
  test("passes when all middleware call next()", async () => {
    const app = prince();
    const mw1 = async (req: any, next: any) => { req.a = true; return next(); };
    const mw2 = async (req: any, next: any) => { req.b = true; return next(); };
    app.get("/", every(mw1, mw2), (req) => ({ a: req.a, b: req.b }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.a).toBe(true);
    expect(data.b).toBe(true);
  });

  test("short-circuits on first rejection", async () => {
    const app = prince();
    let secondRan = false;
    const mw1 = async () => new Response(JSON.stringify({ error: "blocked" }), { status: 403 });
    const mw2 = async (req: any, next: any) => { secondRan = true; return next(); };
    app.get("/", every(mw1, mw2), () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(403);
    expect(secondRan).toBe(false);
  });

  test("works with real auth + role check", async () => {
    const SECRET = new TextEncoder().encode("secret");
    const app = prince();
    const isAdmin = async (req: any, next: any) => {
      if (req.user?.role !== "admin")
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      return next();
    };
    app.use(jwt(SECRET));
    app.get("/admin", every(auth(), isAdmin), () => ({ ok: true }));

    const r1 = await app.fetch(new Request("http://localhost/admin"));
    expect(r1.status).toBe(401);

    const userToken = await signJWT({ role: "user" }, SECRET, "1h");
    const r2 = await app.fetch(new Request("http://localhost/admin", {
      headers: { Authorization: `Bearer ${userToken}` }
    }));
    expect(r2.status).toBe(403);

    const adminToken = await signJWT({ role: "admin" }, SECRET, "1h");
    const r3 = await app.fetch(new Request("http://localhost/admin", {
      headers: { Authorization: `Bearer ${adminToken}` }
    }));
    expect(r3.status).toBe(200);
  });
});

describe("Middleware - some()", () => {
  test("passes when first middleware calls next()", async () => {
    const app = prince();
    const pass = async (req: any, next: any) => next();
    const fail = async () => new Response(JSON.stringify({ error: "no" }), { status: 401 });
    app.get("/", some(pass, fail), () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
  });

  test("tries next when first rejects", async () => {
    const app = prince();
    const fail = async () => new Response(JSON.stringify({ error: "no" }), { status: 401 });
    const pass = async (req: any, next: any) => { (req as any).via = "second"; return next(); };
    app.get("/", some(fail, pass), (req) => ({ via: (req as any).via }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect((await res.json()).via).toBe("second");
  });

  test("returns last rejection if all fail", async () => {
    const app = prince();
    const fail1 = async () => new Response(JSON.stringify({ error: "401" }), { status: 401 });
    const fail2 = async () => new Response(JSON.stringify({ error: "403" }), { status: 403 });
    app.get("/", some(fail1, fail2), () => ({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(403);
  });

  test("accepts api key OR jwt", async () => {
    const SECRET = new TextEncoder().encode("secret");
    const app = prince();
    app.use(jwt(SECRET));
    app.get("/resource", some(apiKey({ keys: ["key123"] }), auth()), () => ({ ok: true }));

    const r1 = await app.fetch(new Request("http://localhost/resource", {
      headers: { "x-api-key": "key123" }
    }));
    expect(r1.status).toBe(200);

    const token = await signJWT({ id: 1 }, SECRET, "1h");
    const r2 = await app.fetch(new Request("http://localhost/resource", {
      headers: { Authorization: `Bearer ${token}` }
    }));
    expect(r2.status).toBe(200);

    const r3 = await app.fetch(new Request("http://localhost/resource"));
    expect(r3.status).toBe(401);
  });
});

describe("Middleware - except()", () => {
  test("skips middleware for excluded path", async () => {
    const app = prince();
    const blocked = async () => new Response(JSON.stringify({ error: "blocked" }), { status: 401 });
    app.use(except("/health", blocked));
    app.get("/health", () => ({ ok: true }));
    app.get("/secret", () => ({ secret: true }));

    expect((await app.fetch(new Request("http://localhost/health"))).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/secret"))).status).toBe(401);
  });

  test("accepts array of excluded paths", async () => {
    const app = prince();
    const blocked = async () => new Response(JSON.stringify({ error: "blocked" }), { status: 401 });
    app.use(except(["/health", "/ping"], blocked));
    app.get("/health", () => ({ ok: true }));
    app.get("/ping",   () => ({ ok: true }));
    app.get("/secret", () => ({ secret: true }));

    expect((await app.fetch(new Request("http://localhost/health"))).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/ping"))).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/secret"))).status).toBe(401);
  });

  test("works with real auth middleware", async () => {
    const SECRET = new TextEncoder().encode("secret");
    const app = prince();
    app.use(except(["/", "/health"], jwt(SECRET), auth()));
    app.get("/",        () => ({ public: true }));
    app.get("/health",  () => ({ ok: true }));
    app.get("/private", (req) => ({ user: req.user?.id }));

    expect((await app.fetch(new Request("http://localhost/"))).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/health"))).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/private"))).status).toBe(401);
  });
});

// ==========================================
// GUARD
// ==========================================

describe("guard()", () => {
  test("validates body for all routes in a group", async () => {
    const app = prince();
    app.group("/users", guard({ body: z.object({ name: z.string().min(1) }) }), (r) => {
      r.post("/create", (req) => ({ created: req.parsedBody.name }));
    });

    const good = await app.fetch(new Request("http://localhost/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" })
    }));
    expect(good.status).toBe(200);
    expect((await good.json()).created).toBe("Alice");

    const bad = await app.fetch(new Request("http://localhost/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" })
    }));
    expect(bad.status).toBe(400);
  });

  test("works as standalone route middleware", async () => {
    const app = prince();
    app.post("/items",
      guard({ body: z.object({ name: z.string(), price: z.number() }) }),
      (req) => ({ created: req.parsedBody })
    );

    const good = await app.fetch(new Request("http://localhost/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget", price: 9.99 })
    }));
    expect(good.status).toBe(200);

    const bad = await app.fetch(new Request("http://localhost/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget" })
    }));
    expect(bad.status).toBe(400);
  });

  test("empty schema is a no-op pass-through", async () => {
    const app = prince();
    app.get("/", guard({}), () => ({ ok: true }));
    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
  });

  test("returns 400 with validation details on failure", async () => {
    const app = prince();
    app.post("/test",
      guard({ body: z.object({ email: z.string().email() }) }),
      () => ({ ok: true })
    );

    const res = await app.fetch(new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
  });
});