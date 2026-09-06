// princejs/scheduler.ts

export const cron = (pattern: string, task: () => void) => {
  const parts = pattern.trim().split(/\s+/);
  const [minute, hour, day, month, dow] = parts;

  console.log(`CRON REGISTERED: ${pattern} → ${task.toString().slice(0, 50)}...`);

  const check = () => {
    const now = new Date();
    const m = now.getMinutes();
    const h = now.getHours();

    const matchMinute =
      minute === "*" ? true :
      minute.includes("/") ? m % parseInt(minute.split("/")[1]) === 0 :
      minute.includes(",") ? minute.split(",").map(Number).includes(m) :
      m === parseInt(minute);

    const matchHour =
      hour === "*" ? true :
      hour.includes("/") ? h % parseInt(hour.split("/")[1]) === 0 :
      h === parseInt(hour);

    if (matchMinute && matchHour) {
      console.log(`CRON TRIGGERED: ${pattern} @ ${now.toLocaleTimeString()}`);
      try { task(); } catch (e) { console.error("CRON ERROR:", e); }
    }
  };

  // Run immediately if matches
  check();

  // Then every minute
  setInterval(check, 60_000);
};

// === OPENAPI ===

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ScalarOptions {
  /** Scalar theme. Options: "default" | "alternate" | "moon" | "purple" | "solarized" | "bluePlanet" | "deepSpace" | "saturn" | "kepler" | "mars" | "none" */
  theme?: string;
  /** Page title shown in the browser tab. Defaults to the spec's info.title. */
  pageTitle?: string;
  /** Layout mode. "modern" (default) or "classic" */
  layout?: "modern" | "classic";
  /** Hide the spec download button. */
  hideDownloadButton?: boolean;
  /** Custom CSS injected into the page. */
  customCss?: string;
}

export interface OpenAPIBuilder {
  /** The raw spec object — mutate this to add paths, components, etc. */
  spec: OpenAPISpec;

  /** Backward-compatible direct accessors — mirrors spec.openapi / .info / .paths */
  readonly openapi: string;
  readonly info: OpenAPISpec["info"];
  readonly paths: OpenAPISpec["paths"];

  /**
   * Returns a plain-function route handler that serves the Scalar UI.
   * Mount it on any path in your router.
   *
   * Works with any framework that uses `(req, res) => void` handlers
   * (Node http, Express, Fastify inject, etc.).
   *
   * @example
   * // Plain Node http
   * server.on("request", (req, res) => {
   *   if (req.url === "/docs")  return api.scalar()(req, res);
   *   if (req.url === "/openapi.json") return api.json()(req, res);
   * });
   *
   * @example
   * // Express / Hono-style
   * app.get("/docs", api.scalar({ theme: "moon" }));
   * app.get("/openapi.json", api.json());
   */
  scalar(options?: ScalarOptions): (req: unknown, res: {
    writeHead(status: number, headers: Record<string, string>): void;
    end(body: string): void;
  }) => void;

  /**
   * Returns a route handler that serves the raw OpenAPI spec as JSON.
   *
   * @example
   * app.get("/openapi.json", api.json());
   */
  json(): (req: unknown, res: {
    writeHead(status: number, headers: Record<string, string>): void;
    end(body: string): void;
  }) => void;
}

export const renderScalarHtml = (spec: OpenAPISpec, options: ScalarOptions = {}): string => {
  const {
    pageTitle = (spec.info.title as string) ?? "API Reference",
    theme = "default",
    layout = "modern",
    hideDownloadButton = false,
    customCss = "",
  } = options;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    ${customCss ? `<style>${customCss}</style>` : ""}
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json"
      data-theme="${theme}"
      data-layout="${layout}"
      ${hideDownloadButton ? 'data-hide-download-button="true"' : ""}
    >${JSON.stringify(spec)}</script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
};

/**
 * Creates an OpenAPI builder with a `.scalar()` and `.json()` route handler,
 * mirroring the Hono / @scalar/hono-api-reference middleware pattern —
 * but framework-agnostic.
 *
 * @example
 * import http from "http";
 * import { openapi } from "./scheduler";
 *
 * const api = openapi({ title: "My API", version: "1.0.0" });
 *
 * api.spec.paths["/hello"] = {
 *   get: { summary: "Say hello", responses: { 200: { description: "OK" } } },
 * };
 *
 * http.createServer((req, res) => {
 *   if (req.url === "/docs")         return api.scalar({ theme: "moon" })(req, res);
 *   if (req.url === "/openapi.json") return api.json()(req, res);
 * }).listen(3000);
 */
export const openapi = (info: { title: string; version: string }): OpenAPIBuilder => {
  const spec: OpenAPISpec = { openapi: "3.0.0", info, paths: {} };

  return {
    spec,

    // Expose spec fields at top level for backward compatibility —
    // so openapi(info).openapi / .info / .paths all work directly.
    get openapi() { return spec.openapi; },
    get info()    { return spec.info; },
    get paths()   { return spec.paths; },

    scalar(options: ScalarOptions = {}) {
      return (_req: unknown, res: { writeHead: Function; end: Function }) => {
        const html = renderScalarHtml(spec, options);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      };
    },

    json() {
      return (_req: unknown, res: { writeHead: Function; end: Function }) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(spec, null, 2));
      };
    },
  };
};