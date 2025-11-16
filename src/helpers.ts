// princejs/helpers.ts
import type { PrinceRequest } from "./prince";

// === CACHE ===
export const cache = (ttl: number) => {
  const store: Record<string, { data: any; exp: number }> = {};
  return (handler: any) => async (req: PrinceRequest) => {
    const key = req.url;
    const now = Date.now();
    if (store[key]?.exp > now) return store[key].data;
    const data = await handler(req);
    store[key] = { data, exp: now + ttl * 1000 };
    setTimeout(() => delete store[key], ttl * 1000 + 1000);
    return data;
  };
};

// === EMAIL ===
export const email = async (to: string, subject: string, html: string) => {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_KEY}` },
    body: JSON.stringify({ from: "no-reply@princejs.dev", to, subject, html })
  });
};

// === AI ===
export const ai = async (prompt: string) => {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.XAI_KEY}` },
    body: JSON.stringify({ model: "grok-beta", messages: [{ role: "user", content: prompt }] })
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
};

// === UPLOAD ===
export const upload = () => {
  return async (req: PrinceRequest) => {
    const form = await req.formData();
    const file = form.get("file") as File;
    return { name: file.name, size: file.size };
  };
};