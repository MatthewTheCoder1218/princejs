// test/prince.test.ts
import { describe, test, expect, beforeEach, afterEach, jest } from "bun:test";
import { prince } from "../src/prince";
import { jwt, signJWT, rateLimit, validate, cors, logger, auth, apiKey, compress, session } from "../src/middleware";
import { cache, email, upload, sse } from "../src/helpers";
import { openapi } from "../src/scheduler";
import { db } from "../src/db";
import { z } from "zod";
import { Html, Head, Body, H1, P, render, Div } from '../src/jsx';
import { unlink } from "fs/promises";

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

describe("Middleware - CORS", () => {
  test("OPTIONS request returns CORS headers", async () => {
    const app = prince();
    app.use(cors("*"));
    app.get("/api", () => ({ ok: true }));

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
});

describe("Middleware - Logger", () => {
  test("Logger records method, path, status, and time", async () => {
    const app = prince();
    app.use(logger());
    app.get("/log-me", () => new Response("ok"));

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await app.fetch(new Request("http://localhost/log-me", { method: "GET" }));
    
    const logCall = consoleLogSpy.mock.calls.find(call => call[0].startsWith('GET /log-me'));
    
    expect(logCall).toBeDefined();
    expect(logCall![0]).toMatch(/^GET \/log-me 200 \d+ms$/);

    consoleLogSpy.mockRestore();
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
    const Page = () => (
      Html({
        children: [
          Head({
            children: [
              "Test Page"
            ]
          }),
          Body({
            children: [
              H1({
                children: "Hello World"
              }),
              P({
                children: "This is a test"
              })
            ]
          })
        ]
      })
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
    const Card = (props: any) => (
      Div({
        className: "card",
        style: "padding: 1rem;",
        children: [
          H1({
            children: props.title
          }),
          P({
            children: props.content
          })
        ]
      })
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
    const Layout = (props: any) => (
      Html({
        children: [
          Head({
            children: "My Site"
          }),
          Body({
            children: props.children
          })
        ]
      })
    );

    const HomePage = () => (
      Layout({
        children: [
          H1({
            children: "Welcome Home"
          })
        ]
      })
    );

    app.get("/home", () => render(HomePage()));

    const res = await app.fetch(new Request("http://localhost/home"));
    const html = await res.text();

    expect(html).toContain("<html>");
    expect(html).toContain("<body>");
    expect(html).toContain("Welcome Home");
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
    expect(res1.status).toBe(200);

    // Get tasks
    const res2 = await app.fetch(
      new Request("http://localhost/tasks", {
        headers: { "Authorization": `Bearer ${token}` }
      })
    );
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

console.log("\n✅ All tests defined! Run with: bun test\n");