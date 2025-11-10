# PrinceJS

**The fastest backend framework ever made.**  <br>
**Under 5 kB • Beats Hono and Express • Built in 3 days** <br>

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

```bash
app.json(data, status?) — clean JSON with status
app.error(handler) — global error handling
```


### Benchmarks (real Windows laptop)
```bash
PrinceJS: 24k–47k requests in 10s
Hono:     20k–40k requests in 10s
Express:  ~7k requests in 10s
```

Same code. Same features. Same machine.

### Author
Matthew Micheal — Nigeria

Made in PowerShell on a school laptop.

### Links

npm: https://www.npmjs.com/package/princejs

GitHub: https://github.com/MatthewTheCoder1218/princejs


PrinceJS — Small. Fast. Unbeatable.

```bash
pnpm add princejs
```