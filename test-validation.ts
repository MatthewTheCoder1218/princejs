import { prince } from "./src/prince";
import { validate } from "./src/validation";
import { z } from "zod";

const app = prince(true);

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().min(18)
});

// Option 1: Use validate as global middleware
// app.use(validate(userSchema, "body"));

// Option 2: Create route-specific validation handlers
app.post("/users", async (req) => {
  // Validate manually in handler
  try {
    const validated = userSchema.parse(req.body);
    return { success: true, data: validated };
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: err.errors }),
      { status: 400, headers: { "Content-Type": "application/json" }}
    );
  }
});

const searchSchema = z.object({
  q: z.string().min(1),
  page: z.string().optional()
});

app.get("/search", (req) => {
  try {
    const validated = searchSchema.parse(req.query);
    return { success: true, query: validated };
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: err.errors }),
      { status: 400, headers: { "Content-Type": "application/json" }}
    );
  }
});

const paramsSchema = z.object({
  id: z.string().regex(/^\d+$/)
});

app.get("/users/:id", (req) => {
  try {
    const validated = paramsSchema.parse(req.params);
    return { success: true, params: validated };
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: err.errors }),
      { status: 400, headers: { "Content-Type": "application/json" }}
    );
  }
});

app.listen(5000);