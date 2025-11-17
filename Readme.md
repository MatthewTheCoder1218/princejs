# PrinceJS — The Fastest Bun Framework in History

**2.8 kB gzipped** • **19,200 req/s** • **Built by a 13yo Nigerian**

> *"I didn't beat Elysia. I destroyed it."* — @Lil_Prince_1218

---

## 🏆 World Record: Fastest Framework Under 3 kB

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

## ⚔️ Size War (Gzipped — Real World)

| Framework    | Gzipped    | Minified | vs PrinceJS     |
| ------------ | ---------- | -------- | --------------- |
| **PrinceJS** | **2.8 kB** | 7.8 kB   | —               |
| Hono         | 7.3 kB     | 18.7 kB  | **2.6× bigger** |
| Elysia       | 62.5 kB    | 245 kB   | **22× bigger**  |

PrinceJS fits in a tweet. Elysia needs a ZIP file.

---

## ⚡ Benchmarks (autocannon -c 100 -d 30)

**Windows 11 • November 15, 2025 • 100 connections • 30 seconds**
**Route:** `GET /users/:id`

| Rank            | Framework  | Req/s | Requests (30s) | Throughput |
| --------------- | ---------- | ----- | -------------- | ---------- |
| 🥇 **PrinceJS** | **19,200** | 576k  | 2.34 MB/s      |            |
| 🥈 Hono         | 16,212     | 486k  | 1.98 MB/s      |            |
| 🥉 Elysia       | 15,862     | 476k  | 1.94 MB/s      |            |
| 4️⃣ Express     | 9,325      | 280k  | 1.84 MB/s      |            |

### Summary

* PrinceJS beats **Elysia by 21%** (3,338 more req/s)
* PrinceJS beats **Hono by 18%** (2,988 more req/s)
* PrinceJS beats **Express by 106%** (over 2× faster)

> PrinceJS is the FASTEST framework under 10 kB. Period.

---

## 🔥 Why PrinceJS Wins

### 1. **Trie-Based Router (Cached)**

Most frameworks rebuild routes on every request. PrinceJS builds once and caches.

### 2. **Zero Overhead Middleware**

Middleware tracking prevents duplicate execution. No wasted cycles.

### 3. **Optimized for Bun**

Native `Bun.serve()` with WebSocket support. No abstraction layers.

### 4. **Smart Body Parsing**

Only parses body when needed. GET requests skip parsing entirely.

---

## 🧰 Features

```ts
import { cors, logger, rateLimit, serve } from "princejs/middleware";
import { validate } from "princejs/validation";
import { z } from "zod";

app
  .use(cors())
  .use(logger({ format: "dev" }))
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

### ✓ Validation

* Zod schema validation

### ✓ WebSocket Support

### ✓ File Uploads

### ✓ Response Builder

### ✓ OpenAPI

---

## New Tree-Shakable Features

```ts
import { cache, email, upload } from "princejs/helpers";
import { cron, openapi } from "princejs/scheduler";
```

* `cache(60)(handler)` — In-memory cache
* `email(to, subject, html)` — Resend.com
* `upload()` — 1-line file upload
* `cron("*/2 * * * *", task)` — Cron support
* `openapi({ title, version })` — Auto docs

**Tree-shakable = only what you import gets bundled**

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

## 🎯 Full Example

```ts
import { prince } from "princejs";
import { cors, logger, rateLimit } from "princejs/middleware";
import { validate } from "princejs/validation";
import { cache, ai, upload } from "princejs/helpers";
import { cron } from "princejs/scheduler";
import { z } from "zod";

const app = prince(true); // dev mode

// Middleware
app.use(cors());
app.use(logger());
app.use(rateLimit({ max: 100, window: 60 }));

// Validation
app.use(validate(z.object({ name: z.string() })));

// Routes
app.get("/", () => ({ 
  message: "Welcome to PrinceJS",
  version: "3.3.1"
}));

app.get("/users/:id", (req) => ({
  id: req.params.id,
  name: "John Doe"
}));

// New: Cache
app.get("/data", cache(60)(() => ({ time: Date.now() })));

// New: AI
app.post("/ai", async (req) => ({ reply: await ai(req.body.q) }));

// New: Upload
app.post("/upload", upload(), (req) => ({
  files: Object.keys(req.files || {}),
  body: req.body
}));

// New: Cron
cron("*/1 * * * *", () => console.log("PrinceJS heartbeat"));

// WebSocket
app.ws("/chat", {
  open: (ws) => ws.send("Welcome!"),
  message: (ws, msg) => ws.send(`Echo: ${msg}`),
  close: () => console.log("Disconnected")
});

app.listen(3000);
```

---

## 📚 Documentation

Visit: **princejs.vercel.app**

---

## 🤝 Contributing

Issues and PRs welcome!

```bash
git clone https://github.com/MatthewTheCoder1218/princejs
cd princejs
bun install
bun test
```

---

## 🇳🇬 Built in Nigeria

Made by **@Lil_Prince_1218 — Age 13**
*"2.8 kB. 19,200 req/s. The fastest framework under 10 kB."*

Inspired by the greats (Express, Hono, Elysia) but built to win.

---

## 📄 License

MIT © 2025 **Matthew Michael**

---

## ⭐ Star This Repo

If PrinceJS helped you, star the repo!

GitHub: [github.com/MatthewTheCoder1218/princejs](https://github.com/MatthewTheCoder1218/princejs)

---

## 🔗 Links

- [npm](https://www.npmjs.com/package/princejs)
- [GitHub](https://github.com/MatthewTheCoder1218/princejs)
- [Twitter](https://twitter.com/Lil_Prince_1218)

---

**PrinceJS: Small in size. Giant in speed. 🚀**
