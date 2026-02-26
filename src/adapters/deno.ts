/**
 * Official Deno Deploy adapter for PrinceJS
 *
 * @example
 * // main.ts
 * import { prince } from "princejs";
 * import { toDeno } from "princejs/deno";
 *
 * const app = prince();
 * app.get("/", () => ({ message: "Hello from Deno Deploy!" }));
 *
 * Deno.serve(toDeno(app));
 *
 * @example
 * // With options (port, hostname, etc.)
 * Deno.serve({ port: 8080 }, toDeno(app));
 */

export type PrinceApp = { fetch(request: Request): Promise<Response> };

/**
 * Returns a Deno.serve()-compatible fetch handler for your Prince app.
 * Pass the result to Deno.serve() as the second argument (or first for default options).
 */
export function toDeno(app: PrinceApp): (request: Request) => Promise<Response> {
  return (request: Request) => app.fetch(request);
}
