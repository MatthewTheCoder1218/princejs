/**
 * Official Vercel deploy adapter for PrinceJS
 * Use with Vercel Edge Runtime or Edge API Routes
 *
 * @example
 * // api/[[...route]].ts (Edge Runtime)
 * import { prince } from "princejs";
 * import { toVercel } from "princejs/vercel";
 *
 * const app = prince();
 * app.get("/", () => ({ message: "Hello from Vercel!" }));
 *
 * export default toVercel(app);
 *
 * @example
 * // vercel.json - use Edge for API
 * // { "functions": { "api/**": { "runtime": "edge" } } }
 */

export type PrinceApp = { fetch(request: Request): Promise<Response> };

/**
 * Returns a Vercel Edge-compatible handler for your Prince app.
 * Use as the default export of your API route.
 */
export function toVercel(app: PrinceApp): (req: Request) => Promise<Response> {
  return (req: Request) => app.fetch(req);
}
