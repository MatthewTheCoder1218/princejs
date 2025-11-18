import { prince } from "../src/prince.ts";
import { cors } from "../src/middleware.ts";
import { describe, it, expect } from "bun:test";

describe("PrinceJS - Middleware", () => {
  it("applies middleware in order", async () => {
    const app = prince();
    let order = "";

    app.use(() => { order += "1"; });
    app.use(() => { order += "2"; });
    app.get("/", () => ({ order }));

    const res = await app.fetch(new Request("http://localhost/"));
    const json = await res.json();
    expect(json.order).toBe("12");
  });

  it("includes cors middleware", async () => {
    const app = prince();
    app.use(cors());
    app.get("/", () => "ok");

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});