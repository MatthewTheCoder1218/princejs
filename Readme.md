# PrinceJS

**The fastest backend framework ever made by a 13-year-old Nigerian.**  <br>
**Under 2 kB • Beats Hono • Built in 3 days** <br>
PrinceJS: 24k–44k RPS (Windows laptop) <br>
Hono:     20k–40k RPS <br>
Express:  ~7k RPS <br>
**Size:** **1.97 kB** (minified)  <br>
**Lines:** **150**  <br>
**Runtime:** Bun only <br>

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

```bash
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

### Features

All HTTP methods (GET POST PUT DELETE PATCH OPTIONS HEAD)
app.json(data, status?) — clean JSON with status
app.error(handler) — global error handling
Safe POST body parsing (never crashes)
Built-in CORS
Auto 404 handling
Zero dependencies
Under 2 kB


Benchmarks (real Windows laptop)
textPrinceJS: 24k–44k requests in 10s
Hono:     20k–40k requests in 10s
Express:  ~7k requests in 10s
Same code. Same features. Same machine.

Author
Matthew Micheal — Age 13 — Nigeria
Made in PowerShell on a school laptop.

Links

npm: https://www.npmjs.com/package/princejs
GitHub: https://github.com/MatthewTheCoder1218/princejs


PrinceJS — Small. Fast. Unbeatable.

```bash
pnpm add princejs
```