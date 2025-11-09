import { Prince } from "./prince";

const app = new Prince();

// CORS + LOG MIDDLEWARE
app.use(async (req, next) => {
  console.log(`\x1b[36m${req.method}\x1b[0m ${req.url}`);
  const res = await next();
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Headers', '*');
  res.headers.set('Access-Control-Allow-Methods', '*');
  return res;
});

// GLOBAL ERROR HANDLER
app.error((err, req) => {
  console.error(`\x1b[31mERROR:\x1b[0m ${err.message}`);
  return app.json({ error: err.message, path: req.url }, 500);
});

// ALL ROUTES
app.get('/', () => app.json({ message: 'PrinceJS is LIVE', author: 'LittlePrince1218', age: 13 }));

app.get('/docs', () => app.json({
  name: 'PrinceJS',
  version: '1.0.0',
  status: 'UNDEFEATED',
  beats: ['Express', 'Hono'],
  madeIn: 'Nigeria'
}));

app.post('/pay', async (req) => {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  return app.json({ url: `https://stripe.com/pay/${body.amount || 999}` });
});

app.put('/user', () => app.json({ method: 'PUT', status: 'updated' }));
app.patch('/user', () => app.json({ method: 'PATCH', status: 'patched' }));
app.delete('/user', () => app.json({ method: 'DELETE', status: 'deleted' }));
app.options('/user', () => new Response(null, { status: 204 }));
app.head('/user', () => new Response(null, { headers: { 'X-Test': 'head' } }));

// 404 TEST
app.get('/not-found', () => { throw new Error('This will 404'); });

// CRASH TEST
app.get('/crash', () => { throw new Error('Server crashed!'); });

app.listen(3000);
console.log('\nPrinceJS FULL TEST SERVER RUNNING');
console.log('http://localhost:3000');
console.log('Test all routes in Thunder Client or curl!\n');