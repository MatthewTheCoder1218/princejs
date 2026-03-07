/**
 * Official Node.js deploy adapter for PrinceJS
 *
 * @example
 * // server.ts
 * import { createServer } from "http";
 * import { prince } from "princejs";
 * import { toNode } from "princejs/node";
 *
 * const app = prince();
 * app.get("/", () => ({ message: "Hello from Node.js!" }));
 *
 * const server = createServer(toNode(app));
 * server.listen(3000, () => {
 *   console.log("Listening on http://localhost:3000");
 * });
 *
 * @example
 * // With Express.js
 * import express from "express";
 * import { prince } from "princejs";
 * import { toExpress } from "princejs/node";
 *
 * const app = express();
 * const princeApp = prince();
 * princeApp.get("/", () => ({ message: "Hello!" }));
 *
 * app.all("*", toExpress(princeApp));
 * app.listen(3000);
 */

export type PrinceApp = { fetch(request: Request): Promise<Response> };

/**
 * Converts a Prince app to a Node.js http.createServer() handler
 * @example
 * const server = createServer(toNode(app));
 * server.listen(3000);
 */
export function toNode(
  app: PrinceApp
): (
  req: any,
  res: any
) => Promise<void> {
  return async (req: any, res: any) => {
    try {
      // Reconstruct the full URL
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
      const url = new URL(req.url || "/", `${protocol}://${host}`);

      // Read the body if it exists
      let body: string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        body = await new Promise<string>((resolve) => {
          let data = "";
          req.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          req.on("end", () => resolve(data));
        });
      }

      // Create a Web Request from Node.js request
      const webRequest = new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        body: body && body.length > 0 ? body : undefined,
      });

      // Get the response from the Prince app
      const webResponse = await app.fetch(webRequest);

      // Convert the Web Response to Node.js response
      res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
      res.end(await webResponse.text());
    } catch (error) {
      console.error("Node adapter error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  };
}

/**
 * Converts a Prince app to an Express.js middleware handler
 * @example
 * app.all("*", toExpress(princeApp));
 */
export function toExpress(
  app: PrinceApp
): (
  req: any,
  res: any,
  next?: any
) => Promise<void> {
  return async (req: any, res: any, _next?: any) => {
    try {
      // Reconstruct the full URL
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host =
        req.headers["x-forwarded-host"] ||
        req.hostname ||
        req.headers.host ||
        "localhost";
      const url = new URL(req.originalUrl || req.url || "/", `${protocol}://${host}`);

      // Create a Web Request from Express request
      const webRequest = new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        body:
          req.body && Object.keys(req.body).length > 0
            ? JSON.stringify(req.body)
            : req.rawBody || undefined,
      });

      // Get the response from the Prince app
      const webResponse = await app.fetch(webRequest);

      // Convert the Web Response to Express response
      res.status(webResponse.status);
      webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      res.send(await webResponse.text());
    } catch (error) {
      console.error("Express adapter error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
}
