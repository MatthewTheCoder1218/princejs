<div align="center">

<img src="./src/images/og.png" alt="PrinceJS"/>

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
| Deploy Adapters | `princejs/vercel` · `princejs/cloudflare` · `princejs/deno` |

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

// Global middleware
app.use(cors());
app.use(logger());
app.use(rateLimit({ max: 100, window: 60 }));
app.use(serve({ root: "./public" }));
app.use(jwt(key));
app.use(session({ secret: "key" }));
app.use(compress());

// JSX
const Page = () => Html(Head("Test Page"), Body(H1("Hello World"), P("This is a test")));
app.get("/jsx", () => render(Page()));

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
app.get("/api", apiKey({ keys: ["key_123"] }), handler);

// Helpers
app.get("/data", cache(60)(() => ({ time: Date.now() })));
app.post("/upload", upload(), (req) => ({ files: Object.keys(req.files || {}) }));
app.get("/events", sse(), (req) => {
  setInterval(() => req.sseSend({ time: Date.now() }), 1000);
});

// Cron
cron("*/1 * * * *", () => console.log("PrinceJS heartbeat"));

// OpenAPI + Scalar docs
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