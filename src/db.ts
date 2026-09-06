// princejs/db.ts
// 🔒 Database helpers with parameterized query support
import { createRequire } from "node:module";

// bun:sqlite only exists under the Bun runtime. Guard the import so the module
// still loads on Node/Deno/Cloudflare — calling db.sqlite() there throws a clear
// error instead of crashing at import time with ERR_UNSUPPORTED_ESM_URL_SCHEME.
let Database: any;
try {
  ({ Database } = createRequire(import.meta.url)("bun:sqlite"));
} catch {
  Database = undefined;
}

export const db = {
  sqlite: (path: string, init?: string) => {
    if (!Database) {
      throw new Error(
        "princejs/db: bun:sqlite is only available when running under the Bun runtime."
      );
    }
    const db = new Database(path);
    if (init) db.run(init);
    
    return {
      // 🔒 FIXED: Ensure parameters are properly used
      query: (sql: string, params?: any[]) => {
        const stmt = db.prepare(sql);
        return params ? stmt.all(...(Array.isArray(params[0]) ? params[0] : params)) : stmt.all();
      },
      
      get: (sql: string, params?: any[]) => {
        const stmt = db.prepare(sql);
        return params ? stmt.get(...(Array.isArray(params[0]) ? params[0] : params)) : stmt.get();
      },
      
      run: (sql: string, params?: any[]) => {
        const stmt = db.prepare(sql);
        return params ? stmt.run(...(Array.isArray(params[0]) ? params[0] : params)) : stmt.run();
      },
      
      prepare: (sql: string) => {
        return db.prepare(sql);
      },
      
      transaction: <T,>(fn: () => T): T => {
        return db.transaction(fn)();
      },
      
      close: () => db.close()
    };
  }
};