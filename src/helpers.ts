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
export const upload = () => {
  return async (req: PrinceRequest) => {
    try {
      // Check if it's a multipart request
      const contentType = req.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return new Response(
          JSON.stringify({ error: 'Expected multipart/form-data' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const formData = await req.formData();
      const file = formData.get('file');
      
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ error: 'No file provided or invalid file' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Return file info
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      };
      
      return new Response(JSON.stringify(fileInfo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Upload error:', error);
      return new Response(
        JSON.stringify({ error: 'Upload failed' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
};