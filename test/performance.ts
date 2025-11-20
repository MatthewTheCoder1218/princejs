// test/performance.ts
import { prince } from "../src/prince";

const app = prince();

// Simple routes for benchmarking
app.get("/", () => ({ message: "Hello World" }));
app.get("/users/:id", (req) => ({ userId: req.params?.id }));
app.post("/users", (req) => ({ created: req.body }));

app.listen(3000);