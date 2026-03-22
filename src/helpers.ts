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

// === SSE ===
export const sse = () => {
  return (req: PrinceRequest) => {
    let controller: ReadableStreamDefaultController;
    
    const stream = new ReadableStream({
      start(c) {
        controller = c;
        
        // Attach send function to request
        req.sseSend = (data: any, event?: string, id?: string) => {
          let message = "";
          if (event) message += `event: ${event}\n`;
          if (id) message += `id: ${id}\n`;
          message += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
        };
      }
    });
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  };
};
// === STREAM ===
// Generator-based streaming for AI/LLM token output, chunked responses etc.
//
// Usage (sync callback):
//   app.get("/ai", stream((req) => {
//     req.streamSend("Hello ");
//     req.streamSend("World");
//     req.streamClose();
//   }));
//
// Usage (async generator):
//   app.get("/ai", stream(async function*(req) {
//     yield "Hello ";
//     yield "World";
//   }));
export const stream = (
  handler: (req: PrinceRequest) => AsyncGenerator<string | Uint8Array, void, unknown> | void | Promise<void>,
  options?: { contentType?: string }
) => {
  const contentType = options?.contentType ?? "text/plain; charset=utf-8";
  const enc = new TextEncoder();

  return (req: PrinceRequest) => {
    // Use a Promise to ensure we have the controller before calling the handler.
    // This works around Bun deferring ReadableStream start() asynchronously.
    let resolveController: (c: ReadableStreamDefaultController<Uint8Array>) => void;
    const controllerReady = new Promise<ReadableStreamDefaultController<Uint8Array>>(
      (res) => { resolveController = res; }
    );

    const readable = new ReadableStream<Uint8Array>({
      start(c) { resolveController(c); },
    });

    // Run handler after controller is ready
    controllerReady.then((controller) => {
      const enqueue = (chunk: string | Uint8Array) =>
        controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk);

      req.streamSend  = enqueue;
      req.streamClose = () => controller.close();
      req.streamError = (e: any) => controller.error(e);

      const result = handler(req);

      if (result && typeof (result as any)[Symbol.asyncIterator] === "function") {
        (async () => {
          try {
            for await (const chunk of result as AsyncGenerator<string | Uint8Array>) {
              enqueue(chunk);
            }
            controller.close();
          } catch (e) { controller.error(e); }
        })();
      } else if (result instanceof Promise) {
        result
          .then(() => { try { controller.close(); } catch {} })
          .catch((e) => { try { controller.error(e); } catch {} });
      } else {
        // Sync callback — it called streamSend/streamClose directly
        // If it didn't call streamClose, close now
        try { controller.close(); } catch {}
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": contentType,
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
};