import { prince } from "./prince";
const app = prince();

// Middleware
app.use(async (req, next) => {
  console.log(req.method, req.url);
  return await next(); // always continue
});

app.get("/", (req, params) => {
  return { message: "Hello from PrinceJS!" };
});

// Routes
app.get("/users/:id", (req, params) => {
  return { userId: params.id, ok: true }; // JSON response
});

app.get("/posts/:pid/comments/:cid", (req, params) => {
  return { pid: params.pid, cid: params.cid }; // JSON response
});

app.get("/static/*", (req, params) => {
  return { message: "single-segment wildcard matched" }; // always JSON
});

app.get("/catchall/**", (req, params) => {
  const rest = params[""] ?? "none";
  return { rest };
});

// Global error handler
app.error((err, req) => {
  console.error("Caught error:", err);
  return app.json({ error: String(err) }, 500);
});

// Start server
app.listen(3000);
