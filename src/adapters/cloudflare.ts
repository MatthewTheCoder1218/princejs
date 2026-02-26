/**
 * Official Cloudflare Workers deploy adapter for PrinceJS
 *
 * @example
 * // src/index.ts (Worker entry)
 * import { prince } from "princejs";
 * import { toWorkers } from "princejs/cloudflare";
 *
 * const app = prince();
 * app.get("/", () => ({ message: "Hello from Workers!" }));
 *
 * export default toWorkers(app);
 *
 * @example
 * // wrangler.toml
 * // [build]
 * // command = "bun run build"
 * // [build.upload]
 * // format = "modules"
 * // main = "dist/worker.js"
 */

export type PrinceApp = { fetch(request: Request): Promise<Response> };

export interface WorkerEnv {
  [key: string]: unknown;
}

/** Cloudflare Workers ExecutionContext (pass-through, no Bun dependency) */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * Returns a Cloudflare Workers fetch handler for your Prince app.
 * Use as the default export of your Worker.
 */
export function toWorkers(app: PrinceApp): {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response>;
} {
  return {
    fetch(request: Request, _env: WorkerEnv, _ctx: ExecutionContext) {
      return app.fetch(request);
    },
  };
}
