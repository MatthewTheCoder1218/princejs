import { prince } from "../src/prince.ts";
import { describe, it, expect } from "bun:test";

describe("PrinceJS - Basic Routing", () => {
  it("responds to GET /", async () => {
    const app = prince();
    app.get("/", () => ({ message: "hello" }));

    const req = new Request("http://localhost/");
    const res = await app.fetch(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "hello" });
  });

  it("handles route parameters", async () => {
    const app = prince();
    app.get("/users/:id", (req) => ({ id: req.params.id }));

    const res = await app.fetch(new Request("http://localhost/users/123"));
    const json = await res.json();

    expect(json).toEqual({ id: "123" });
  });

  it("handles wildcard routes", async () => {
    const app = prince();
    app.get("/files/*", () => "wildcard");

    const res = await app.fetch(new Request("http://localhost/files/uploads/photo.jpg"));
    expect(await res.text()).toBe("wildcard");
  });

  it("returns 404 for unknown routes", async () => {
    const app = prince();
    const res = await app.fetch(new Request("http://localhost/unknown"));
    expect(res.status).toBe(404);
  });
});