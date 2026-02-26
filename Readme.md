# 👑 **PrinceJS**

![PrinceJS Image](./src/images/og.png)

### ⚡ Ultra-clean, modern & minimal Bun web framework built by a 13 year old. Among the top three in performance.

![npm](https://img.shields.io/npm/v/princejs)
![stars](https://img.shields.io/github/stars/MatthewTheCoder1218/princejs)
![downloads](https://img.shields.io/npm/dt/princejs)
![license](https://img.shields.io/github/license/MatthewTheCoder1218/princejs)

---

## 🚀 Quick Start
s
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

### ✓ Middleware

* CORS
* Logger
* Rate Limiting
* Static Files

### ✓ Validation (Zod)

### ✓ File Uploads

### ✓ Response Builder

### WebSocket Support

### Auth & API Keys

### Server-Sent Events

### Sessions

### Response Compression

### Route-level Middleware

### Database (SQLite)

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
import { cron } from "princejs/scheduler";
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
