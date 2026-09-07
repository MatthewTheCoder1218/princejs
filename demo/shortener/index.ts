import {
  render, Html, Head, Title, Meta, Style, Script, Body, Main,
  H1, P, Div, Form, Input, Button,
} from "../../src/jsx.ts";
import { prince } from "../../src/prince.ts";
import { logger, cors, rateLimit, secureHeaders, requestId } from "../../src/middleware.ts";
import { db } from "../../src/db.ts";
import { z } from "zod";
import { fileURLToPath } from "node:url";

const DB_PATH = fileURLToPath(new URL("./links.sqlite", import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const database = db.sqlite(DB_PATH, `
  CREATE TABLE IF NOT EXISTS links (
    code       TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    clicks     INTEGER NOT NULL DEFAULT 0
  )
`);

function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

const app = prince();
app.use(requestId());
app.use(logger());
app.use(secureHeaders());
app.use(cors("*"));

const createLinkSchema = z.object({
  url: z.string().url("must be a valid http(s) URL"),
});
const linkResponseSchema = z.object({
  code: z.string(),
  shortUrl: z.string(),
  url: z.string(),
  clicks: z.number(),
});

const docs = app.openapi({ title: "Pr.in URL Shortener", version: "1.0.0" }, "/docs");

docs.route(
  "post",
  "/api/links",
  {
    summary: "Shorten a URL",
    schema: { body: createLinkSchema, response: linkResponseSchema },
  },
  rateLimit(10, 60),
  (req) => {
    const { url } = req.parsedBody;
    const code = randomCode();
    database.run("INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)", [
      code,
      url,
      Date.now(),
    ]);
    return {
      code,
      shortUrl: `${BASE_URL}/${code}`,
      url,
      clicks: 0,
    };
  }
);

docs.route(
  "get",
  "/api/links/:code",
  {
    summary: "Get info about a short link",
    schema: { response: linkResponseSchema },
  },
  (req) => {
    const link = database.get("SELECT * FROM links WHERE code = ?", [req.params.code]);
    if (!link) return app.json({ error: "Link not found" }, 404);
    return {
      code: link.code,
      shortUrl: `${BASE_URL}/${link.code}`,
      url: link.url,
      clicks: link.clicks,
    };
  }
);

app.get("/api/stats", () => {
  const { total } = database.get("SELECT COUNT(*) AS total FROM links");
  const top = database.query(
    "SELECT code, url, clicks FROM links ORDER BY clicks DESC LIMIT 5"
  );
  return { total, top };
});

app.get("/:code", (req) => {
  const link = database.get("SELECT * FROM links WHERE code = ?", [req.params.code]);
  if (!link) return app.json({ error: "Link not found" }, 404);
  database.run("UPDATE links SET clicks = clicks + 1 WHERE code = ?", [link.code]);
  return app.response().redirect(link.url, 302);
});

const css = `body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#e6e6e6;display:grid;place-items:center;min-height:100vh;margin:0}main{width:100%;max-width:480px;padding:0 20px}h1{font-size:2rem;letter-spacing:-.03em;margin-bottom:.25rem}p{color:#888;margin-top:0}form{display:flex;gap:8px;margin:24px 0}input{flex:1;padding:12px 14px;border-radius:8px;border:1px solid #2a2a33;background:#14141b;color:#fff;font-size:1rem}button{padding:12px 18px;border-radius:8px;border:none;background:#facc15;color:#111;font-weight:700;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}#result{background:#14141b;border:1px solid #2a2a33;border-radius:8px;padding:16px;display:none}#result.show{display:block}a{color:#facc15;word-break:break-all}.err{color:#f87171}`;

const clientScript = `const f=document.getElementById("form"),u=document.getElementById("url"),r=document.getElementById("result");f.addEventListener("submit",async e=>{e.preventDefault();const b=f.querySelector("button");b.disabled=true;b.textContent="...";try{const d=await fetch("/api/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u.value})}).then(x=>x.json());if(!d.code)throw new Error(d.error||"Failed");r.className="show";r.innerHTML="\\u2705 <a href=\\""+d.shortUrl+"\\">"+d.shortUrl+"</a>"}catch(e){r.className="show";r.innerHTML='<span class="err">'+e.message+"</span>"}finally{b.disabled=false;b.textContent="Shorten"}})`;

const page = Html(
  Head(
    Meta({ charset: "utf-8" }),
    Meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
    Title("Pr.in URL Shortener"),
    Style(css),
  ),
  Body(
    Main(
      H1("Pr.in"),
      P("tiny links, zero deps, 5.4 kB server"),
      Form({ id: "form" },
        Input({ id: "url", type: "url", placeholder: "https://example.com/some/long/path", required: true }),
        Button({ type: "submit" }, "Shorten"),
      ),
      Div({ id: "result" }),
    ),
    Script(clientScript),
  ),
);

app.get("/", () => render("<!DOCTYPE html>" + page));

app.listen(PORT);