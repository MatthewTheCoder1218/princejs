<div align="center">

# 👑 PrinceJS

**Ultra-clean, modern & minimal Bun web framework.**  
Built by a 13-year-old Nigerian developer. Among the top three in performance.

[![npm version](https://img.shields.io/npm/v/princejs?style=flat-square)](https://www.npmjs.com/package/princejs)
[![GitHub stars](https://img.shields.io/github/stars/MatthewTheCoder1218/princejs?style=flat-square)](https://github.com/MatthewTheCoder1218/princejs)
[![npm downloads](https://img.shields.io/npm/dt/princejs?style=flat-square)](https://www.npmjs.com/package/princejs)
[![license](https://img.shields.io/github/license/MatthewTheCoder1218/princejs?style=flat-square)](https://github.com/MatthewTheCoder1218/princejs/blob/main/LICENSE)

[**Website**](https://princejs.vercel.app) · [**npm**](https://www.npmjs.com/package/princejs) · [**GitHub**](https://github.com/MatthewTheCoder1218/princejs) · [**Twitter**](https://twitter.com/princejs_bun)

</div>

---

## ⚡ Performance

Benchmarked with `oha -c 100 -z 30s` on Windows 10:

| Framework | Avg Req/s | Peak Req/s |
|-----------|----------:|-----------:|
| Elysia | 27,606 | 27,834 |
| **PrinceJS** | **17,985** | **18,507** |
| Hono | 17,914 | 18,826 |
| Fastify | 15,519 | 16,434 |
| Express | 13,138 | 13,458 |

> PrinceJS is **2.3× faster than Express**, matches Hono head-to-head, and sits at approximately 5kB gzipped — loads in approximately 100ms on a slow 3G connection.

---

## 🚀 Quick Start

```bash
bun add princejs
# or
npm install princejs
```

```ts
import { prince } from "princejs";
import { cors, logger } from "princejs/middleware";

const app = prince();

app.use(cors());
app.use(logger());

app.get("/", () => ({ message: "Hello PrinceJS!" }));
app.get("/users/:id", (req) => ({ id: req.params?.id }));

app.listen(3000);
```

---

## 🧰 Features

| Feature | Import |
|---------|--------|
| Routing, Route Grouping, WebSockets, OpenAPI, Plugins, Lifecycle Hooks, Cookies, IP | `princejs` |
| CORS, Logger, JWT, JWKS, Auth, Rate Limit, Validate, Compress, Session, API Key, Secure Headers, Timeout, Request ID, IP Restriction, Static Files, Trim Trailing Slash, Middleware Combinators (`every`, `some`, `except`), `guard()` | `princejs/middleware` |
| File Uploads, SSE, Streaming, In-memory Cache | `princejs/helpers` |
| Cron Scheduler | `princejs/scheduler` |
| JSX / SSR | `princejs/jsx` |
| SQLite Database | `princejs/db` |
| End-to-End Type Safety | `princejs/client` |
| Vercel Edge adapter | `princejs/vercel` |
| Cloudflare Workers adapter | `princejs/cloudflare` |
| Deno Deploy adapter | `princejs/deno` |
| Node.js / Express adapter | `princejs/node` |

---

## 🍪 Cookies & 🌐 IP Detection

### Reading Cookies

Cookies are automatically parsed and available on every request:

```ts
import { prince } from "princejs";

const app = prince();

app.get("/profile", (req) => ({
  sessionId: req.cookies?.sessionId,
  theme: req.cookies?.theme,
  allCookies: req.cookies, // Record<string, string>
}));
```

### Setting Cookies

Use the response builder for full cookie control:

```ts
app.get("/login", (req) =>
  app.response()
    .status(200)
    .json({ ok: true })
    .cookie("sessionId", "abc123", {
      maxAge: 3600,       // 1 hour
      path: "/",
      httpOnly: true,     // not accessible from JS
      secure: true,       // HTTPS only
      sameSite: "Strict", // CSRF protection
    })
);

// Chain multiple cookies
app.response()
  .json({ ok: true })
  .cookie("session", "xyz")
  .cookie("theme", "dark")
  .cookie("lang", "en");
```

### Client IP Detection

```ts
app.get("/api/data", (req) => ({
  clientIp: req.ip,
  data: [],
}));
```

**Supported headers** (in priority order):
- `X-Forwarded-For` — load balancers, proxies (first IP in list)
- `X-Real-IP` — Nginx, Apache reverse proxy
- `CF-Connecting-IP` — Cloudflare
- `X-Client-IP` — other proxy services
- Fallback — `127.0.0.1`

```ts
// IP-based rate limiting
app.use((req, next) => {
  const count = ipTracker.getCount(req.ip) || 0;
  if (count > 100) return new Response("Too many requests", { status: 429 });
  ipTracker.increment(req.ip);
  return next();
});

// IP allowlist
app.post("/admin", (req) => {
  if (!ALLOWED_IPS.includes(req.ip!)) {
    return new Response("Forbidden", { status: 403 });
  }
  return { authorized: true };
});
```

---


## 🗂️ Route Grouping

Group routes under a shared prefix with optional shared middleware. Zero overhead at request time — purely a registration convenience.

```ts
import { prince } from "princejs";

const app = prince();

// Basic grouping
app.group("/api", (r) => {
  r.get("/users",     () => ({ users: [] }));
  r.post("/users",    (req) => ({ created: req.parsedBody }));
  r.get("/users/:id", (req) => ({ id: req.params?.id }));
});
// → GET  /api/users
// → POST /api/users
// → GET  /api/users/:id

// With shared middleware — applies to every route in the group
import { auth } from "princejs/middleware";

app.group("/admin", auth(), (r) => {
  r.get("/stats",   () => ({ stats: {} }));
  r.delete("/users/:id", (req) => ({ deleted: req.params?.id }));
});

// Chainable
app
  .group("/v1", (r) => { r.get("/ping", () => ({ v: 1 })); })
  .group("/v2", (r) => { r.get("/ping", () => ({ v: 2 })); });

app.listen(3000);
```

---

## 🛡️ Secure Headers

One call sets all the security headers your production app needs:

```ts
import { secureHeaders } from "princejs/middleware";

app.use(secureHeaders());
// Sets: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
//       Strict-Transport-Security, Referrer-Policy

// Custom options
app.use(secureHeaders({
  xFrameOptions: "DENY",
  contentSecurityPolicy: "default-src 'self'",
  permissionsPolicy: "camera=(), microphone=()",
  strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
}));
```

---

## ⏱️ Request Timeout

Kill hanging requests before they pile up:

```ts
import { timeout } from "princejs/middleware";

app.use(timeout(5000));          // 5 second global timeout → 408
app.use(timeout(3000, "Slow!")); // custom message

// Per-route timeout
app.get("/heavy", timeout(10000), (req) => heavyOperation());
```

---

## 🏷️ Request ID

Attach a unique ID to every request for distributed tracing and log correlation:

```ts
import { requestId } from "princejs/middleware";

app.use(requestId());
// → sets req.id and X-Request-ID response header

// Custom header name
app.use(requestId({ header: "X-Trace-ID" }));

// Custom generator
app.use(requestId({ generator: () => `req-${Date.now()}` }));

app.get("/", (req) => ({ requestId: req.id }));
```

---

## 🚫 IP Restriction

Allow or block specific IPs:

```ts
import { ipRestriction } from "princejs/middleware";

// Only allow these IPs
app.use(ipRestriction({ allowList: ["192.168.1.1", "10.0.0.1"] }));

// Block these IPs
app.use(ipRestriction({ denyList: ["1.2.3.4"] }));
```

---

## ✂️ Trim Trailing Slash

Automatically redirect `/users/` → `/users` so you never get mysterious 404s from a stray trailing slash:

```ts
import { trimTrailingSlash } from "princejs/middleware";

app.use(trimTrailingSlash());        // 301 by default
app.use(trimTrailingSlash(302));     // or 302 temporary redirect
```

Root `/` is never redirected. Query strings are preserved — `/search/?q=bun` → `/search?q=bun`.

---

## 🔀 Middleware Combinators

Compose complex auth rules in a single readable line.

### `every()` — all must pass

```ts
import { every } from "princejs/middleware";

const isAdmin = async (req, next) => {
  if (req.user?.role !== "admin")
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  return next();
};

app.get("/admin", every(auth(), isAdmin), () => ({ ok: true }));
// short-circuits on first rejection — isAdmin never runs if auth() fails
```

### `some()` — either must pass

```ts
import { some } from "princejs/middleware";

// Accept a JWT token OR an API key — whichever the client sends
app.get("/resource", some(auth(), apiKey({ keys: ["key_123"] })), () => ({ ok: true }));
```

### `except()` — skip middleware for certain paths

```ts
import { except } from "princejs/middleware";

// Apply auth everywhere except /health and /
app.use(except(["/health", "/"], auth()));

app.get("/health", () => ({ ok: true }));   // no auth
app.get("/private", (req) => ({ user: req.user })); // auth required
```

---

## 🛡️ guard()

Apply a validation schema to every route in a group at once — no need to repeat `validate()` on each handler:

```ts
import { guard } from "princejs/middleware";
import { z } from "zod";

app.group("/users", guard({ body: z.object({ name: z.string().min(1) }) }), (r) => {
  r.post("/",      (req) => ({ created: req.parsedBody.name })); // auto-validated
  r.put("/:id",    (req) => ({ updated: req.parsedBody.name })); // auto-validated
});
// Bad body → 400 { error: "Validation failed", details: [...] }
```

Also works as standalone route middleware:

```ts
app.post(
  "/items",
  guard({ body: z.object({ name: z.string(), price: z.number() }) }),
  (req) => ({ created: req.parsedBody })
);
```

---

## 📁 Static Files

Serve a directory of static files. Falls through to your routes if the file doesn't exist:

```ts
import { serveStatic } from "princejs/middleware";

app.use(serveStatic("./public"));
// → GET /logo.png        serves ./public/logo.png
// → GET /               serves ./public/index.html
// → GET /api/users      falls through to your route handler
```

---

## 🌊 Streaming

Stream chunked responses for AI/LLM output, large payloads, or anything that generates data over time:

```ts
import { stream } from "princejs/helpers";

// Async generator — cleanest for AI token streaming
app.get("/ai", stream(async function*(req) {
  yield "Hello ";
  await delay(100);
  yield "from ";
  yield "PrinceJS!";
}));

// Async callback
app.get("/data", stream(async (req) => {
  req.streamSend("chunk 1");
  await fetchMoreData();
  req.streamSend("chunk 2");
}));

// Custom content type for binary or JSON streams
app.get("/events", stream(async function*(req) {
  for (const item of items) {
    yield JSON.stringify(item) + "\n";
  }
}, { contentType: "application/x-ndjson" }));
```

---

## 🔑 JWKS / Third-Party Auth

Verify JWTs from Auth0, Clerk, Supabase, or any JWKS endpoint — no symmetric key needed:

```ts
import { jwks } from "princejs/middleware";

// Auth0
app.use(jwks("https://your-domain.auth0.com/.well-known/jwks.json"));

// Clerk
app.use(jwks("https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json"));

// Supabase
app.use(jwks("https://your-project.supabase.co/auth/v1/.well-known/jwks.json"));

// req.user is set after verification, same as jwt()
app.get("/protected", auth(), (req) => ({ user: req.user }));
```

---

## 📖 OpenAPI + Scalar Docs ✨

Auto-generate an OpenAPI 3.0 spec and serve a beautiful [Scalar](https://scalar.com) UI — all from a single `app.openapi()` call.

```ts
import { prince } from "princejs";
import { z } from "zod";

const app = prince();

const api = app.openapi({ title: "My API", version: "1.0.0" }, "/docs", { theme: "moon" });

api.route("GET", "/users/:id", {
  summary: "Get user by ID",
  tags: ["users"],
  schema: {
    response: z.object({ id: z.string(), name: z.string() }),
  },
}, (req) => ({ id: req.params!.id, name: "Alice" }));

api.route("POST", "/users", {
  summary: "Create user",
  tags: ["users"],
  schema: {
    body:     z.object({ name: z.string().min(2), email: z.string().email() }),
    response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  },
}, (req) => ({ id: crypto.randomUUID(), ...req.parsedBody }));

app.listen(3000);
// → GET /docs       Scalar UI
// → GET /docs.json  Raw OpenAPI JSON
```

`api.route()` does three things at once:

- ✅ Registers the route on PrinceJS
- ✅ Auto-wires body validation — no separate middleware needed
- ✅ Writes the full OpenAPI spec entry

| `schema` key | Runtime effect | Scalar docs |
|---|---|---|
| `body` | ✅ Validates & rejects bad requests | ✅ requestBody model |
| `query` | — | ✅ Typed query params |
| `response` | — | ✅ 200 response model |

> Routes on `app.get()` / `app.post()` stay private — they never appear in the docs.

**Themes:** `default` · `moon` · `purple` · `solarized` · `bluePlanet` · `deepSpace` · `saturn` · `kepler` · `mars`

---

## 🔌 Plugin System

```ts
import { prince, type PrincePlugin } from "princejs";

const usersPlugin: PrincePlugin<{ prefix?: string }> = (app, opts) => {
  const base = opts?.prefix ?? "";

  app.use((req, next) => {
    (req as any).fromPlugin = true;
    return next();
  });

  app.get(`${base}/users`, (req) => ({
    ok: true,
    fromPlugin: (req as any).fromPlugin,
  }));
};

const app = prince();
app.plugin(usersPlugin, { prefix: "/api" });
app.listen(3000);
```

---

## 🎣 Lifecycle Hooks

```ts
import { prince } from "princejs";

const app = prince();

app.onRequest((req) => {
  (req as any).startTime = Date.now();
});

app.onBeforeHandle((req, path, method) => {
  console.log(`🔍 ${method} ${path}`);
});

app.onAfterHandle((req, res, path, method) => {
  const ms = Date.now() - (req as any).startTime;
  console.log(`✅ ${method} ${path} ${res.status} (${ms}ms)`);
});

app.onError((err, req, path, method) => {
  console.error(`❌ ${method} ${path}:`, err.message);
});

app.get("/users", () => ({ users: [] }));
app.listen(3000);
```

**Execution order:**
1. `onRequest` — runs before routing, good for setup
2. `onBeforeHandle` — just before the handler
3. Handler executes
4. `onAfterHandle` — after success (skipped on error)
5. `onError` — only when handler throws

---

## 🔒 End-to-End Type Safety

```ts
import { createClient, type PrinceApiContract } from "princejs/client";

type ApiContract = {
  "GET /users/:id": {
    params: { id: string };
    response: { id: string; name: string };
  };
  "POST /users": {
    body: { name: string };
    response: { id: string; ok: boolean };
  };
};

const client = createClient<ApiContract>("http://localhost:3000");

const user = await client.get("/users/:id", { params: { id: "42" } });
console.log(user.name); // typed as string ✅

const created = await client.post("/users", { body: { name: "Alice" } });
console.log(created.id); // typed as string ✅
```

---

## 🌍 Deploy Adapters

**Vercel Edge** — `api/[[...route]].ts`
```ts
import { toVercel } from "princejs/vercel";
export default toVercel(app);
```

**Cloudflare Workers** — `src/index.ts`
```ts
import { toWorkers } from "princejs/cloudflare";
export default toWorkers(app);
```

**Deno Deploy** — `main.ts`
```ts
import { toDeno } from "princejs/deno";
Deno.serve(toDeno(app));
```

**Node.js** — `server.ts`
```ts
import { createServer } from "http";
import { toNode, toExpress } from "princejs/node";
import express from "express";

const app = prince();
app.get("/", () => ({ message: "Hello!" }));

// Native Node http
createServer(toNode(app)).listen(3000);

// Or drop into Express
const expressApp = express();
expressApp.all("*", toExpress(app));
expressApp.listen(3000);
```

---

## 🎯 Full Example

```ts
import { prince } from "princejs";
import {
  cors,
  logger,
  rateLimit,
  auth,
  apiKey,
  jwt,
  signJWT,
  session,
  compress,
  validate,
  secureHeaders,
  timeout,
  requestId,
  trimTrailingSlash,
  every,
  some,
  except,
  guard,
} from "princejs/middleware";
import { cache, upload, sse, stream } from "princejs/helpers";
import { cron } from "princejs/scheduler";
import { Html, Head, Body, H1, P, render } from "princejs/jsx";
import { db } from "princejs/db";
import { z } from "zod";

const SECRET = new TextEncoder().encode("your-secret");
const app = prince();

// ── Lifecycle hooks ───────────────────────────────────────
app.onRequest((req) => { (req as any).t = Date.now(); });
app.onAfterHandle((req, res, path, method) => {
  console.log(`✅ ${method} ${path} ${res.status} (${Date.now() - (req as any).t}ms)`);
});
app.onError((err, req, path, method) => {
  console.error(`❌ ${method} ${path}:`, err.message);
});

// ── Global middleware ─────────────────────────────────────
app.use(secureHeaders());
app.use(requestId());
app.use(trimTrailingSlash());
app.use(timeout(10000));
app.use(cors());
app.use(logger());
app.use(rateLimit(100, 60));
app.use(jwt(SECRET));
app.use(session({ secret: "session-secret" }));
app.use(compress());

// ── JSX SSR ───────────────────────────────────────────────
const Page = () => Html(Head("Home"), Body(H1("Hello World"), P("Welcome!")));
app.get("/", () => render(Page()));

// ── Cookies & IP ──────────────────────────────────────────
app.post("/login", (req) =>
  app.response()
    .json({ ok: true, ip: req.ip })
    .cookie("sessionId", "user_123", {
      httpOnly: true, secure: true, sameSite: "Strict", maxAge: 86400,
    })
);
app.get("/profile", (req) => ({
  sessionId: req.cookies?.sessionId,
  clientIp: req.ip,
}));

// ── Database ──────────────────────────────────────────────
const users = db.sqlite("./app.sqlite", `
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL)
`);
app.get("/users", () => users.query("SELECT * FROM users"));

// ── WebSockets ────────────────────────────────────────────
app.ws("/chat", {
  open:    (ws) => ws.send("Welcome!"),
  message: (ws, msg) => ws.send(`Echo: ${msg}`),
  close:   (ws) => console.log("disconnected"),
});

// ── Auth & API keys ───────────────────────────────────────
app.get("/protected", auth(), (req) => ({ user: req.user }));
app.get("/api", apiKey({ keys: ["key_123"] }), () => ({ ok: true }));
app.get("/admin", every(auth(), async (req, next) => {
  if (req.user?.role !== "admin")
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  return next();
}), () => ({ admin: true }));

// ── Validated route group ─────────────────────────────────
app.group("/items", guard({ body: z.object({ name: z.string().min(1) }) }), (r) => {
  r.post("/", (req) => ({ created: req.parsedBody.name }));
});

// ── Helpers ───────────────────────────────────────────────
app.get("/cached",  cache(60)(() => ({ time: Date.now() })));
app.post("/upload", upload());
app.get("/events",  sse(), (req) => {
  let i = 0;
  const id = setInterval(() => {
    req.sseSend({ count: i++ });
    if (i >= 10) clearInterval(id);
  }, 1000);
});

// ── Validation ────────────────────────────────────────────
app.post(
  "/items",
  validate(z.object({ name: z.string().min(1), price: z.number().positive() })),
  (req) => ({ created: req.parsedBody })
);

// ── Cron ──────────────────────────────────────────────────
cron("* * * * *", () => console.log("💓 heartbeat"));

// ── OpenAPI + Scalar ──────────────────────────────────────
const api = app.openapi({ title: "PrinceJS App", version: "1.0.0" }, "/docs");

api.route("GET", "/items", {
  summary: "List items",
  tags: ["items"],
  schema: {
    query:    z.object({ q: z.string().optional() }),
    response: z.array(z.object({ id: z.string(), name: z.string() })),
  },
}, () => [{ id: "1", name: "Widget" }]);

api.route("POST", "/items", {
  summary: "Create item",
  tags: ["items"],
  schema: {
    body:     z.object({ name: z.string().min(1), price: z.number().positive() }),
    response: z.object({ id: z.string(), name: z.string() }),
  },
}, (req) => ({ id: crypto.randomUUID(), name: req.parsedBody.name }));

app.listen(3000);
```

---

## 📦 Installation

```bash
bun add princejs
# or
npm install princejs
```

---

## 🤝 Contributing

```bash
git clone https://github.com/MatthewTheCoder1218/princejs
cd princejs
bun install
bun test
```

---

## 🔗 Links

- 🌐 Website: [princejs.vercel.app](https://princejs.vercel.app)
- 📦 npm: [npmjs.com/package/princejs](https://www.npmjs.com/package/princejs)
- 💻 GitHub: [github.com/MatthewTheCoder1218/princejs](https://github.com/MatthewTheCoder1218/princejs)
- 🐦 Twitter: [@princejs_bun](https://twitter.com/princejs_bun)

---

<div align="center">

**PrinceJS: ~5kB. Hono-speed. Everything included. 👑**

*Built with ❤️ in Nigeria*

</div>