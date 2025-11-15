#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const name = Bun.argv[2];

if (!name) {
  console.error("❌ Error: Please provide a project name");
  console.log("Usage: bunx create-princejs <project-name>");
  process.exit(1);
}

if (existsSync(name)) {
  console.error(`❌ Error: Directory "${name}" already exists`);
  process.exit(1);
}

console.log(`🎨 Creating PrinceJS project: ${name}...`);

// Create project directory
mkdirSync(name, { recursive: true });
mkdirSync(join(name, "src"), { recursive: true });

// Create package.json
const packageJson = {
  name: name,
  version: "1.0.0",
  type: "module",
  scripts: {
    dev: "bun --watch src/index.ts",
    start: "bun src/index.ts"
  },
  dependencies: {
    princejs: "latest"
  },
  devDependencies: {
    "@types/bun": "latest",
    "bun-types": "latest"
  }
};

writeFileSync(
  join(name, "package.json"),
  JSON.stringify(packageJson, null, 2)
);

// Create main index.ts with better example
const indexContent = `import { prince } from "princejs";
import { cors, logger } from "princejs/middleware";

const app = prince(true); // dev mode enabled

// Middleware
app.use(cors());
app.use(logger({ format: "dev" }));

// Routes
app.get("/", () => {
  return { message: "Welcome to PrinceJS! 🚀" };
});

app.get("/hello/:name", (req) => {
  return { message: \`Hello, \${req.params.name}!\` };
});

app.post("/echo", (req) => {
  return { echo: req.body };
});

// WebSocket example
app.ws("/ws", {
  open: (ws) => {
    console.log("Client connected");
    ws.send("Welcome to WebSocket!");
  },
  message: (ws, msg) => {
    console.log("Received:", msg);
    ws.send(\`Echo: \${msg}\`);
  },
  close: (ws) => {
    console.log("Client disconnected");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT);
`;

writeFileSync(join(name, "src", "index.ts"), indexContent);

// Create tsconfig.json
const tsconfigContent = {
  compilerOptions: {
    lib: ["ESNext"],
    target: "ESNext",
    module: "ESNext",
    moduleDetection: "force",
    jsx: "react-jsx",
    allowJs: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noPropertyAccessFromIndexSignature: false,
    types: ["bun-types"]
  }
};

writeFileSync(
  join(name, "tsconfig.json"),
  JSON.stringify(tsconfigContent, null, 2)
);

// Create .gitignore
const gitignoreContent = `node_modules
.DS_Store
*.log
dist
.env
.env.local
`;

writeFileSync(join(name, ".gitignore"), gitignoreContent);

// Create README.md
const readmeContent = `# ${name}

A PrinceJS application.

## Getting Started

Install dependencies:
\`\`\`bash
bun install
\`\`\`

Run the development server:
\`\`\`bash
bun run dev
\`\`\`

Your server will be running at \`http://localhost:3000\`

## Available Endpoints

- \`GET /\` - Welcome message
- \`GET /hello/:name\` - Personalized greeting
- \`POST /echo\` - Echo back request body
- \`WS /ws\` - WebSocket connection

## Learn More

- [PrinceJS Documentation](https://github.com/MatthewTheCoder1218/princejs)
- [Bun Documentation](https://bun.sh/docs)
`;

writeFileSync(join(name, "README.md"), readmeContent);

// Create .env.example
const envContent = `PORT=3000
`;

writeFileSync(join(name, ".env.example"), envContent);

console.log("\n✅ Project created successfully!\n");
console.log("📂 Next steps:");
console.log(`   cd ${name}`);
console.log("   bun install");
console.log("   bun run dev\n");
console.log("🚀 Your server will start at http://localhost:3000");
console.log("📚 Check README.md for more information\n");