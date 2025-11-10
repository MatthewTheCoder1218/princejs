# PrinceJS

**The fastest backend framework ever made.**  
**Beats Hono and Express • Built in 3 days** \

---

### Install

```bash
pnpm add princejs
# or
bun add princejs
# or
npm install princejs
```

### Quick Start

```ts
import { Prince } from 'princejs';

const app = new Prince();

// CORS + logging
app.use(async (req, next) => {
  console.log(`${req.method} ${req.url}`);
  const res = await next();
  res.headers.set('Access-Control-Allow-Origin', '*');
  return res;
});

// Global error handler
app.error((err) => app.json({ error: err.message }, 500));

// Routes
app.get('/', () => app.json({ hello: 'PrinceJS', age: 13 }));

app.post('/pay', async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  return app.json({ url: `https://stripe.com/pay/${body.amount || 999}` });
});

app.listen(3000);
```

---

## Features

All HTTP methods: **GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD**

```bash
app.json(data, status?) — clean JSON with status
app.error(handler) — global error handling
```

---

## 🔥 Benchmark Comparison (real Windows laptop)

Real-world 30-second load test with `autocannon -c 100 -d 30`.

### **Framework Performance Table**

| Framework            | Avg Req/sec  | Total Requests (30s) | Avg Bytes/sec | Avg Latency  |
| -------------------- | ------------ | -------------------- | ------------- | ------------ |
| **PrinceJS** | **8,526.34** | **256,000**          | **1.14 MB/s** | **11.22 ms** |
| Hono                 | 8,044.8      | 241,000              | 1.08 MB/s     | 11.22 ms     |
| Elysia               | 9,531.21     | 286,000              | 1.28 MB/s     | 10 ms        |

---

### Author

Matthew Micheal — Nigeria

Made in PowerShell on a school laptop.

### Links

npm: [https://www.npmjs.com/package/princejs](https://www.npmjs.com/package/princejs)

github: [https://github.com/MatthewTheCoder1218/princejs](https://github.com/MatthewTheCoder1218/princejs)

---

PrinceJS — Small. Fast. Unbeatable.

```bash
pnpm add princejs
```
