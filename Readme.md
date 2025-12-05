# 👑 **PrinceJS**

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

### ✓ Middleware

* CORS
* Logger
* Rate Limiting
* Static Files

### ✓ Validation (Zod)

### ✓ File Uploads

### ✓ Response Builder

### ✓ OpenAPI

---

## New Tree‑Shakable Features

```ts
import { cache, email, upload } from "princejs/helpers";
import { cron, openapi } from "princejs/scheduler";
```

* `cache(60)(handler)` — In‑memory cache
* `email(to, subject, html)` — Email helper
* `upload()` — One‑line file upload
* `cron("*/2 * * * *", task)` — Cron jobs
* `openapi({ title, version })` — Auto docs

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
import { cors, logger, rateLimit } from "princejs/middleware";
import { validate } from "princejs/validation";
import { cache, upload } from "princejs/helpers";
import { cron } from "princejs/scheduler";
import { Html, Head, Body, H1, P, render } from "princejs/jsx"
import { z } from "zod";

const app = prince(true);

app.use(cors());
app.use(logger());
app.use(rateLimit({ max: 100, window: 60 }));

app.use(validate(z.object({ name: z.string() })));

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

app.get("/", () => ({ message: "Welcome to PrinceJS" }));

app.get("/users/:id", (req) => ({ id: req.params.id }));

app.get("/jsx", () => render(Page()));

app.get("/data", cache(60)(() => ({ time: Date.now() })));

app.post("/upload", upload(), (req) => ({ files: Object.keys(req.files || {}) }));

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
