# princejs — The Smallest Bun Framework in History

**2.8 kB gzipped** • **~600k req/30s** • **Built by a 13yo Nigerian**

> *"I didn’t beat Elysia. I outsmarted it."* — @Lil_Prince_1218

---

## 🚀 Get Started

```bash
# Create a new PrinceJS app
bun create princejs my-app

# Move into the project
cd my-app

# Run in development mode
bun dev
```

```ts
import { Prince } from "princejs";
import { cors } from "princejs/middleware";

const app = new Prince()
  .use(cors())
  .get("/", () => "Hello princejs")
  .get("/users/:id", (req) => ({ id: req.params.id }));

app.listen(5000);
```

---

## ⚔️ Size War (Gzipped — Real World)

| Framework    | Gzipped    | Minified   | vs princejs |
| ------------ | ---------- | ---------- | ----------- |
| **princejs** | **2.8 kB** | **7.8 kB** | —           |
| **Hono**     | 7.3 kB     | 18.7 kB    | 2.6× bigger |
| **Elysia**   | 62.5 kB    | 245 kB     | 22× bigger  |

> princejs fits in a tweet. Elysia needs a ZIP file.

---

## ⚡ Benchmarks (3×3 — Windows, Nov 11, 2025)

| Framework    | Requests (30s) | Req/s      | Notes          |
| ------------ | -------------- | ---------- | -------------- |
| **princejs** | **599k**       | **19,966** | 🥈 2nd fastest |
| **Elysia**   | 602k           | 20,071     | 🥇 0.5% faster |
| **Hono**     | 578k           | 19,254     | 🥉 Slower      |

> Elysia is only 0.5% faster. But princejs is **22× smaller**.

---

## 🧹 Features

```ts
.use(rateLimit({ max: 100 }))
.use(validate(z.object({ name: z.string() })))
```

✅ Zod Validation
✅ CORS + Logger
✅ Rate Limit Middleware

---

## 📦 Install

```bash
npm i princejs
# or
bun add princejs
```

---

## 📚 Docs

**coming soon →** [princejs.vercel.app](https://princejs.vercel.app)

---

## 🇳🇬 Built in Nigeria

**@Lil_Prince_1218 — 13 years old**

> *“2.8 kB. 600k req. No excuses.”*
