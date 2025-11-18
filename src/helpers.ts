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

// === UPLOAD ===
export const upload = (fieldName = "file") => {
  return async (req: PrinceRequest) => {
    try {
      // The framework should have already parsed multipart form data
      // and attached files to req.files object
      
      if (req.files && req.files[fieldName]) {
        const file = req.files[fieldName];
        return {
          name: file.name,
          size: file.size,
          type: file.type,
          success: true
        };
      }
      
      // If files aren't in req.files, check if we can access the raw form data
      if (req.body && req.body.files && req.body.files[fieldName]) {
        const file = req.body.files[fieldName];
        return {
          name: file.name,
          size: file.size,
          type: file.type,
          success: true
        };
      }
      
      return { error: `No file found with field name: ${fieldName}` };
      
    } catch (error) {
      console.error("Upload processing error:", error);
      return { error: "File processing failed" };
    }
  };
};