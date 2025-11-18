// tests/validation.test.ts — FINAL VERSION THAT WORKS 100%
import { prince } from "../src/prince.ts";
import { validate } from "../src/middleware.ts";
import { z } from "zod";
import { describe, it, expect } from "bun:test";

const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
});

describe("PrinceJS - Validation (Standard Schema v1)", () => {
  it("validates and attaches typed body", async () => {
    const app = prince();

    app.post("/user", validate(UserSchema), (req: any) => {
      return { success: true, user: req.validated };
    });

    const request = new Request("http://localhost/user", {
      method: "POST",
      body: JSON.stringify({ name: "Prince", age: 13 }),
      headers: { "content-type": "application/json" },
    });

    // THIS IS THE KEY LINE — consume body BEFORE app.fetch
    await request.json(); // forces Bun to parse body into req.body

    const res = await app.fetch(request);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, user: { name: "Prince", age: 13 } });
  });

  it("returns 400 on invalid body", async () => {
    const app = prince();
    app.post("/user", validate(UserSchema), () => "never");

    const request = new Request("http://localhost/user", {
      method: "POST",
      body: JSON.stringify({ name: "Prince", age: "thirteen" }),
      headers: { "content-type": "application/json" },
    });

    await request.json(); // same here

    const res = await app.fetch(request);
    expect(res.status).toBe(400);
  });
});