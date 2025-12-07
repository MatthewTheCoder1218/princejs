// princejs/db.ts
// @ts-nocheck 
import { Database } from "bun:sqlite";

export const db = {
  sqlite: (path: string, init?: string) => {
    const db = new Database(path);
    if (init) db.run(init);
    
    return {
      query: (sql: string, params?: any[]) => {
        return db.query(sql).all(params);
      },
      
      get: (sql: string, params?: any[]) => {
        return db.query(sql).get(params);
      },
      
      run: (sql: string, params?: any[]) => {
        return db.run(sql, params);
      },
      
      prepare: (sql: string) => {
        return db.query(sql);
      },
      
      close: () => db.close()
    };
  }
};