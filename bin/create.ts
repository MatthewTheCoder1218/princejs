#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "fs";

const name = Bun.argv[2] || "prince-app";
mkdirSync(name, { recursive: true });
writeFileSync(`${name}/index.ts`, `
import { prince } from "princejs";
const app = prince();
app.get("/", () => ({ message: "Hello from PrinceJS!" }));
app.listen(3000);
`);
console.log("✅ Created", name);
console.log("👉 To get started:");
console.log(`   cd ${name}`);
console.log("   bun install princejs");
console.log("   bun run index.ts");