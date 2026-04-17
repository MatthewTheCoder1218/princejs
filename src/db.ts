// princejs/db.ts
// 🔒 Database helpers with parameterized query support
import { Database } from "bun:sqlite";

export const db = {
  sqlite: (path: string, init?: string) => {
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