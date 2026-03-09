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

| Framework | Req/s | Total |
|-----------|------:|------:|
| Elysia | 25,312 | 759k |
| Hono | 22,124 | 664k |
| **PrinceJS** | **21,748** | **653k** |
| Express | 9,325 | 280k |

> PrinceJS is **2.3× faster than Express** and sits comfortably in the top 3 — at just **4.4kB gzipped**.

---

## 🚀 Quick Start

```bash
npm install princejs
bun add princejs
yarn add princejs
```

```ts
import { prince } from "princejs";
import { cors, logger } from "princejs/middleware";

const app = prince();

app.use(cors());
app.use(logger());

app.get("/", () => ({ message: "Hello PrinceJS!" }));
app.get("/users/:id", (req) => ({ id: req.params.id }));

app.listen(3000);
```

---

## 🧰 Features

| Feature | Import |
|---------|--------|
| Routing | `princejs` |
| Middleware (CORS, Logger, Rate Limit, Auth, JWT) | `princejs/middleware` |
| Zod Validation | `princejs/middleware` |
| **Cookies & IP Detection** | `princejs` |
| File Uploads | `princejs/helpers` |
| WebSockets | `princejs` |
| Server-Sent Events | `princejs/helpers` |
| Sessions | `princejs/middleware` |
| Response Compression | `princejs/middleware` |
| In-memory Cache | `princejs/helpers` |
| Cron Scheduler | `princejs/scheduler` |
| **OpenAPI + Scalar Docs** | `princejs` |
| JSX / SSR | `princejs/jsx` |
| SQLite Database | `princejs/db` |
| Plugin System | `princejs` |
| End-to-End Type Safety | `princejs/client` |
| Deploy Adapters | `princejs/vercel` · `princejs/cloudflare` · `princejs/deno` · `princejs/node` |
| Lifecycle Hooks | `princejs` | 

---

## 🍪 Cookies & 🌐 IP Detection

### Reading Cookies

Cookies are automatically parsed from the request:

```ts
app.get("/profile", (req) => ({
  sessionId: req.cookies?.sessionId,
  theme: req.cookies?.theme,
  allCookies: req.cookies // Record<string, string>
}));
```

### Setting Cookies

Use the response builder to set cookies with full control:

```ts
app.get("/login", (req) => 
  app.response()
    .status(200)
    .json({ ok: true })
    .cookie("sessionId", "abc123", {
      maxAge: 3600,        // 1 hour
      path: "/",
      httpOnly: true,      // not accessible from JS
      secure: true,        // HTTPS only
      sameSite: "Strict"   // CSRF protection
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

Automatically detect client IP from request headers:

```ts
app.get("/api/data", (req) => ({
  clientIp: req.ip,
  data: [...]
}));
```

**Supported headers** (in priority order):
- `X-Forwarded-For` — Load balancers, proxies (first IP in list)
- `X-Real-IP` — Nginx, Apache reverse proxy
- `CF-Connecting-IP` — Cloudflare
- `X-Client-IP` — Other proxy services
- Fallback — `127.0.0.1` (localhost)

**Use cases:**
- 🔒 Rate limiting per IP
- 📊 Geolocation analytics
- 🚨 IP-based access control
- 👥 User tracking & fraud detection

```ts
// Rate limit by IP
app.use((req, next) => {
  const ip = req.ip;
  const count = ipTracker.getCount(ip) || 0;
  if (count > 100) return new Response("Too many requests", { status: 429 });
  ipTracker.increment(ip);
  return next();
});

// IP-based security
app.post("/admin", (req) => {
  if (!ALLOWED_IPS.includes(req.ip!)) {
    return new Response("Forbidden", { status: 403 });
  }
  return { authorized: true };
});
```

---

## 📖 OpenAPI + Scalar Docs ✨

Auto-generate an OpenAPI 3.0 spec and serve a beautiful [Scalar](https://scalar.com) UI — all from a single `app.openapi()` call. Routes, validation, and docs stay in sync automatically.

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
- ✅ Auto-wires `validate(schema.body)` — no separate import needed
- ✅ Writes the full OpenAPI spec entry

| `schema` key | Runtime | Scalar Docs |
|---|---|---|
| `body` | ✅ Validates request | ✅ requestBody model |
| `query` | — | ✅ Typed query params |
| `response` | — | ✅ 200 response model |

> Routes on `app.get()` / `app.post()` stay private — never appear in docs.

**Themes:** `default` · `moon` · `purple` · `solarized` · `bluePlanet` · `deepSpace` · `saturn` · `kepler` · `mars`

---

## 🔌 Plugin System

Share bundles of routes and middleware as reusable plugins:

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
```

---

## 🎣 Lifecycle Hooks

React to key moments in request processing with lifecycle hooks:

```ts
import { prince } from "princejs";

const app = prince();

// Called for every incoming request
app.onRequest((req) => {
  console.log(`📥 Request received: ${req.method} ${req.url}`);
});

// Called before handler execution
app.onBeforeHandle((req, path, method) => {
  console.log(`🔍 About to handle: ${method} ${path}`);
  (req as any).startTime = Date.now();
});

// Called after successful handler execution
app.onAfterHandle((req, res, path, method) => {
  const duration = Date.now() - (req as any).startTime;
  console.log(`✅ Response: ${method} ${path} ${res.status} (${duration}ms)`);
});

// Called when handler throws an error
app.onError((err, req, path, method) => {
  console.error(`❌ Error in ${method} ${path}:`, err.message);
  // Send alert, log to monitoring service, etc.
});

app.get("/users", () => ({ users: [] }));
```

**Hook execution order:**
1. `onRequest` — early for request-wide setup
2. `onBeforeHandle` — just before route handler runs
3. Handler executes
4. `onAfterHandle` — after success (on error, skipped)
5. `onError` — only if handler throws (skips onAfterHandle)

**Use cases:**
- 📊 Metrics & observability
- 🔍 Request inspection & debugging
- ⏱️ Timing & performance monitoring
- 🚨 Error tracking & alerting  
- 🔐 Security audits & compliance logging

---

## 🔒 End-to-End Type Safety

Define a contract once — your client gets full TypeScript autocompletion automatically:

```ts
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

import { createClient } from "princejs/client";

const client = createClient<ApiContract>("http://localhost:3000");

const user = await client.get("/users/:id", { params: { id: "42" } });
console.log(user.name); // typed as string ✅
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

**Node Adapter** - `server.ts`
```ts
import { createServer } from "http";
import { toNode, toExpress } from "princejs/node";

const app = prince();
app.get("/", () => ({ message: "Hello from Node!" }));

// Native Node.js http
const server = createServer(toNode(app));
server.listen(3000);

// Or with Express
import express from "express";
const expressApp = express();
expressApp.all("*", toExpress(app));
expressApp.listen(3000);
```

---

## 🎯 Full Example

```ts
import { prince } from "princejs";
import { cors, logger, rateLimit, auth, apiKey, jwt, session, compress, serve } from "princejs/middleware";
import { validate } from "princejs/validation";
import { cache, upload, sse } from "princejs/helpers";
import { cron } from "princejs/scheduler";
import { Html, Head, Body, H1, P, render } from "princejs/jsx";
import { db } from "princejs/db";
import { z } from "zod";

const app = prince(true);

// ==========================================
// LIFECYCLE HOOKS - Timing & Observability
// ==========================================
app.onRequest((req) => {
  (req as any).startTime = Date.now();
});

app.onBeforeHandle((req, path, method) => {
  console.log(`🔍 Handling: ${method} ${path}`);
});

app.onAfterHandle((req, res, path, method) => {
  const duration = Date.now() - (req as any).startTime;
  console.log(`✅ ${method} ${path} → ${res.status} (${duration}ms)`);
});

app.onError((err, req, path, method) => {
  console.error(`❌ ${method} ${path} failed:`, err.message);
});

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================
app.use(cors());
app.use(logger());
app.use(rateLimit({ max: 100, window: 60 }));
app.use(serve({ root: "./public" }));
app.use(jwt(key));
app.use(session({ secret: "key" }));
app.use(compress());

// ==========================================
// ROUTES
// ==========================================

// JSX
const Page = () => Html(Head("Test Page"), Body(H1("Hello World"), P("This is a test")));
app.get("/jsx", () => render(Page()));

// Cookies & IP Detection
app.post("/login", (req) => 
  app.response()
    .json({ ok: true, ip: req.ip })
    .cookie("sessionId", "user_123", { 
      httpOnly: true, 
      secure: true,
      sameSite: "Strict",
      maxAge: 86400 // 24 hours
    })
);

app.get("/profile", (req) => ({
  sessionId: req.cookies?.sessionId,
  clientIp: req.ip,
}));

// Database
const users = db.sqlite("./db.sqlite", "CREATE TABLE users...");
app.get("/users", () => users.query("SELECT * FROM users"));

// WebSockets
app.ws("/chat", {
  open: (ws) => ws.send("Welcome!"),
  message: (ws, msg) => ws.send(`Echo: ${msg}`),
});

// Auth
app.get("/protected", auth(), (req) => ({ user: req.user }));
app.get("/api", apiKey({ keys: ["key_123"] }), (req) => ({ ok: true }));

// Helpers
app.get("/data", cache(60)(() => ({ time: Date.now() })));
app.post("/upload", upload(), (req) => ({ files: Object.keys(req.files || {}) }));
app.get("/events", sse(), (req) => {
  setInterval(() => req.sseSend({ time: Date.now() }), 1000);
});

// ==========================================
// CRON JOBS
// ==========================================
cron("*/1 * * * *", () => console.log("PrinceJS heartbeat"));

// ==========================================
// OPENAPI + SCALAR DOCS
// ==========================================
const api = app.openapi({ title: "PrinceJS App", version: "1.0.0" }, "/docs");
api.route("GET", "/items", {
  summary: "List items",
  tags: ["items"],
  schema: {
    query:    z.object({ q: z.string().optional() }),
    response: z.array(z.object({ id: z.string(), name: z.string() })),
  },
}, () => [{ id: "1", name: "Widget" }]);

app.listen(3000);
```

---

## 📦 Installation

```bash
bun add princejs
# or
npm install princejs
# or
yarn add princejs
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

**PrinceJS: Small in size. Giant in capability. 👑**

*Built with ❤️ in Nigeria*

</div>