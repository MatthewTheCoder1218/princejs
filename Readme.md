# 👑 **PrinceJS**

![PrinceJS Image](./src/images/og.png)

### ⚡ Ultra-clean, modern & minimal Bun web framework built by a 13 year old. Among the top three in performance.

![npm](https://img.shields.io/npm/v/princejs)
![stars](https://img.shields.io/github/stars/MatthewTheCoder1218/princejs)
![downloads](https://img.shields.io/npm/dt/princejs)
![license](https://img.shields.io/github/license/MatthewTheCoder1218/princejs)

---

## 🚀 Quick Start
```bash
bun create princejs my-app
cd my-app
bun dev
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

```ts
import { cors, logger, rateLimit, serve } from "princejs/middleware";
import { validate } from "princejs/validation";
import { z } from "zod";

app
  .use(cors())
  .use(logger())
  .use(rateLimit({ max: 100, window: 60 }))
  .use(serve({ root: "./public" }))
  .use(validate(z.object({ 
    name: z.string(),
    age: z.number() 
  })));
```

### Middleware

* CORS
* Logger
* Rate Limiting
* Static Files

### Validation (Zod)

### File Uploads

### Response Builder

### WebSocket Support

### Auth & API Keys

### Server-Sent Events

### Sessions

### Response Compression

### Route-level Middleware

### Plugin System

You can share bundles of routes and middleware as plugins.

```ts
import { prince, type PrincePlugin } from "princejs";

const usersPlugin: PrincePlugin<{ prefix?: string }> = (app, opts) => {
  const base = opts?.prefix ?? "";

  // plugin-wide middleware
  app.use((req, next) => {
    (req as any).fromPlugin = true;
    return next();
  });

  // plugin routes
  app.get(`${base}/users`, (req) => ({
    ok: true,
    fromPlugin: (req as any).fromPlugin,
  }));
};

const app = prince();
app.plugin(usersPlugin, { prefix: "/api" });
```

### OpenAPI + Scalar Docs

Auto-generate an OpenAPI 3.0 spec and serve a beautiful [Scalar](https://scalar.com) API reference UI — all from a single `app.openapi()` call. Routes, validation, and docs stay in sync automatically.

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

**`api.route()` does three things at once:**
- Registers the route on PrinceJS (same as `app.get()` / `app.post()`)
- Auto-wires `validate(schema.body)` middleware — no separate import needed
- Writes the full OpenAPI spec entry including path params, request body, query params, and response schema

| `schema` key | Runtime effect | Scalar docs |
|---|---|---|
| `body` | ✅ Validates & strips via `validate()` | ✅ requestBody model |
| `query` | ❌ docs only | ✅ typed query params |
| `response` | ❌ docs only | ✅ 200 response model |

Routes registered with `app.get()` / `app.post()` directly never appear in the docs — useful for internal health checks, webhooks, and admin endpoints.

**Available themes:** `default` · `moon` · `purple` · `solarized` · `bluePlanet` · `deepSpace` · `saturn` · `kepler` · `mars`

### Database (SQLite)

### End to End Type-Safety

PrinceJS supports contract-based type safety to sync your frontend and backend seamlessly. By defining an API contract, your client receives full TypeScript autocompletion and type-checking for routes, parameters, and responses.


**Define Your Contract**

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
```

**Initialize The Client**

```ts
import { createClient } from "princejs/client";

const client = createClient<ApiContract>("http://localhost:3000");

// Fully typed request and response
const user = await client.get("/users/:id", { params: { id: "42" } });
console.log(user.name); // Typed as string
```

---

## Deploy (Vercel, Workers, Deno)

Official adapters let you run the same Prince app on Vercel Edge, Cloudflare Workers, and Deno Deploy.

**Vercel (Edge)** — `api/[[...route]].ts`:

```ts
import { prince } from "princejs";
import { toVercel } from "princejs/vercel";

const app = prince();
app.get("/", () => ({ message: "Hello from Vercel!" }));

export default toVercel(app);
```

**Cloudflare Workers** — `src/index.ts`:

```ts
import { prince } from "princejs";
import { toWorkers } from "princejs/cloudflare";

const app = prince();
app.get("/", () => ({ message: "Hello from Workers!" }));

export default toWorkers(app);
```

**Deno Deploy** — `main.ts`:

```ts
import { prince } from "princejs";
import { toDeno } from "princejs/deno";

const app = prince();
app.get("/", () => ({ message: "Hello from Deno!" }));

Deno.serve(toDeno(app));
```

---

## Performance With Oha (oha -c 100 -z 30s)

| Framework | Req/s          | Total  |
|-----------|----------------|--------|
| Elysia    | 25,312 req/s   | 759k   |
| Hono      | 22,124 req/s   | 664k   |
| PrinceJS  | 21,748 req/s   | 653k   |
| Express   | 9,325 req/s    | 280k   |

### Among the top three

---

## 🎯 Full Example

```ts
import { prince } from "princejs";
import { cors, logger, rateLimit, auth, apiKey, jwt, session, compress, serve } from "princejs/middleware";
import { validate } from "princejs/validation";
import { cache, upload, sse } from "princejs/helpers";
import { cron, openapi } from "princejs/scheduler";
import { Html, Head, Body, H1, P, render } from "princejs/jsx"
import { db } from "princejs/db";
import { z } from "zod";

const app = prince(true);

app.use(cors());
app.use(logger());
app.use(rateLimit({ max: 100, window: 60 }));

app.use(serve({ root: "./public" }));

app.use(validate(z.object({ name: z.string() })));

app.use(jwt(key));
app.use(session({ secret: "key" }));
app.use(compress());

const Page = () => Html(
  Head("Test Page"),
  Body(
    H1("Hello World"),
    P("This is a test")
  )
);

// With props (optional)
const Card = (props: any) => Div(
  { className: "card", style: "padding: 1rem;" },
  H1(props.title),
  P(props.content)
);

// Without props
const Simple = () => Div(
  H1("No Props Needed"),
  P("Just pure content")
);

const requireAuth = async (req: any, next: any) => {
  const token = req.headers.get("Authorization");
  if (!token) return new Response("Unauthorized", { status: 401 });
  req.user = { id: 1, name: "Alice" };
  return next();
};

app.get("/protected", requireAuth, async (req) => {
  return { user: req.user };
});

const users = db.sqlite("./db.sqlite", "CREATE TABLE users...");

app.ws("/chat", {
  open: (ws) => ws.send("Welcome!"),
  message: (ws, msg) => ws.send(`Echo: ${msg}`)
});


app.get("/protected", auth(), (req) => ({ user: req.user }));
app.get("/api", apiKey({ keys: ["key_123"] }), handler);

app.get("/", () => ({ message: "Welcome to PrinceJS" }));

app.get("/users/:id", (req) => ({ id: req.params.id }));

app.get("/jsx", () => render(Page()));

app.get("/data", cache(60)(() => ({ time: Date.now() })));

app.post("/upload", upload(), (req) => ({ files: Object.keys(req.files || {}) }));

app.get("/events", sse(), (req) => {
  setInterval(() => req.sseSend({ time: Date.now() }), 1000);
});

app.get("/count", (req) => ({ visits: req.session.visits++ || 1 }));

app.get("/users", () => users.query("SELECT * FROM users"));

cron("*/1 * * * *", () => console.log("PrinceJS heartbeat"));

// OpenAPI + Scalar
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
npm install princejs
# or
bun add princejs
# or
yarn add princejs
```

---

## 📚 Documentation

Visit: **princejs.vercel.app**

---

## 🤝 Contributing

```bash
git clone https://github.com/MatthewTheCoder1218/princejs
cd princejs
bun install
bun test
```

---

## ⭐ Star This Repo

If PrinceJS helped you, star the repo!

GitHub: [https://github.com/MatthewTheCoder1218/princejs](https://github.com/MatthewTheCoder1218/princejs)

---

## 🔗 Links

* npm: [https://www.npmjs.com/package/princejs](https://www.npmjs.com/package/princejs)
* GitHub: [https://github.com/MatthewTheCoder1218/princejs](https://github.com/MatthewTheCoder1218/princejs)
* Twitter: [https://twitter.com/Lil_Prince_1218](https://twitter.com/Lil_Prince_1218)

---

**PrinceJS: Small in size. Giant in capability. 🚀**