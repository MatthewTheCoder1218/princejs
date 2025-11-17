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

type Provider = "openai" | "grok" | "huggingface";
interface AIOptions {
  provider?: Provider;
  model?: string;
  temperature?: number;
  apiKey?: string;
}

const DEFAULTS = {
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  grok: { url: "https://api.x.ai/v1/chat/completions", model: "grok-beta" },
  huggingface: { url: "", model: "meta-llama/Llama-3.3-70B-Instruct" }
};

export const ai = async (prompt: string, opts: AIOptions = {}): Promise<string> => {
  // FIXED: Bun.env (not env)
  const provider = opts.provider || "openai";
  const config = DEFAULTS[provider];
  if (!config.url) throw new Error(Hugging Face needs direct model URL);

  // FIXED: Load .env if not loaded
  if (!Bun.env.OPENAI_API_KEY) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
    } catch (e) {
      console.warn("dotenv not found — set keys manually in Bun.env");
    }
  }

  const apiKey = opts.apiKey || Bun.env[${provider.toUpperCase()}_API_KEY];
  if (!apiKey) throw new Error(Missing ${provider.toUpperCase()}_API_KEY in Bun.env);

  const headers = {
    "Content-Type": "application/json",
    Authorization: Bearer ${apiKey}
  };

  const body = provider === "huggingface" 
    ? { inputs: prompt, parameters: { temperature: opts.temperature ?? 0.7 } }
    : {
        model: opts.model || config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: 512
      };

  const res = await fetch(config.url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(${provider} failed: ${res.status} - ${err});
  }

  const data = await res.json();

  if (provider === "huggingface") {
    return data[0]?.generated_text?.trim() || "No response";
  }

  return data.choices[0]?.message?.content?.trim() || "Empty response";
};

// === UPLOAD ===
export const upload = () => {
  return async (req: PrinceRequest) => {
    const form = await req.formData();
    const file = form.get("file") as File;
    return { name: file.name, size: file.size };
  };
};