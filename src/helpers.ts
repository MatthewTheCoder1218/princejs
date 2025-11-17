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

// princejs/helpers/ai.ts
// 100% FIXED — NO MORE ERRORS

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
  huggingface: { url: "" }
};

export const ai = async (prompt: string, opts: AIOptions = {}): Promise<string> => {
  const provider = opts.provider || "openai";
  const config = DEFAULTS[provider];

  // Hugging Face needs model in URL
  if (provider === "huggingface" && !opts.model) {
    throw new Error("Hugging Face requires 'model' option (e.g. meta-llama/Llama-3.3-70B-Instruct)");
  }

  const apiKey = opts.apiKey || Bun.env[`${provider.toUpperCase()}_API_KEY`];
  if (!apiKey) {
    throw new Error(`Missing ${provider.toUpperCase()}_API_KEY in environment`);
  }

  const url = provider === "huggingface"
    ? `https://api-inference.huggingface.co/models/${opts.model}`
    : config.url;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  const body = provider === "huggingface"
    ? { inputs: prompt, parameters: { temperature: opts.temperature ?? 0.7 } }
    : {
        model: opts.model || config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: 1024
      };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (provider === "huggingface") {
    return (data[0]?.generated_text || "").trim();
  }

  return data.choices?.[0]?.message?.content?.trim() || "No response";
};

// === UPLOAD ===
export const upload = () => {
  return async (req: PrinceRequest) => {
    const form = await req.formData();
    const file = form.get("file") as File;
    return { name: file.name, size: file.size };
  };
};