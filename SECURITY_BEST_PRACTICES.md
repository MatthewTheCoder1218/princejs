# 🛡️ PrinceJS Security Best Practices & Examples

This guide demonstrates how to use the new security features and best practices for using PrinceJS securely.

---

## Table of Contents
1. [CSRF Protection](#csrf-protection)
2. [Input Validation & Sanitization](#input-validation--sanitization)
3. [Secure File Uploads](#secure-file-uploads)
4. [Environment Configuration](#environment-configuration)
5. [JWT Authentication](#jwt-authentication)
6. [Rate Limiting](#rate-limiting)
7. [Header Security](#header-security)
8. [Database Security](#database-security)
9. [Complete Example](#complete-example)

---

## CSRF Protection

### Basic Usage
```typescript
import { prince } from "princejs";
import { csrf, session } from "princejs/middleware";

const app = prince();

// Enable CSRF protection
app.use(session({ secret: process.env.SESSION_SECRET! }));
app.use(csrf());

// CSRF token is automatically generated for GET requests
app.get("/form", (req) => {
  const csrfToken = req.headers.get("csrf") || "no-token";
  return {
    html: `
      <form method="POST" action="/submit">
        <input type="hidden" name="" value="${csrfToken}">
        <input type="text" name="data">
        <button type="submit">Submit</button>
      </form>
    `
  };
});

// Protected POST endpoint requires valid CSRF token
app.post("/submit", (req) => {
  // Token is automatically validated by CSRF middleware
  return { success: true, data: req.parsedBody };
});

app.listen(3000);
```

### Custom Configuration
```typescript
// Custom cookie name and header name
app.use(csrf({
  cookieName: "token",
  headerName: "x-token",
  keyLength: 64  // Stronger tokens
}));
```

---

## Input Validation & Sanitization

### Sanitizing User Input
```typescript
import { sanitize } from "princejs/helpers";
import { validate } from "princejs/middleware";
import { z } from "zod";

const app = prince();

// Pattern 1: Manual sanitization
app.post("/comment", (req) => {
  const { text } = req.parsedBody;
  const safeText = sanitize(text, 'text');  // Escape HTML
  return { comment: safeText };
});

// Pattern 2: URL validation
app.post("/link", (req) => {
  try {
    const { url } = req.parsedBody;
    const safeUrl = sanitize(url, 'url');  // Validate and normalize
    return { url: safeUrl };
  } catch (error) {
    return { error: "Invalid URL" };
  }
});

// Pattern 3: Combined with Zod validation
const commentSchema = z.object({
  text: z.string().min(1).max(1000),
  userId: z.string().uuid()
});

app.post("/safe-comment", 
  validate(commentSchema),
  (req) => {
    const { text, userId } = req.parsedBody;
    // Body is already validated by Zod
    const sanitized = sanitize(text, 'text');
    return { 
      comment: sanitized, 
      userId, 
      timestamp: Date.now() 
    };
  }
);

app.listen(3000);
```

### XSS Prevention Examples
```typescript
// ❌ UNSAFE - Can execute scripts
const unsafe = "<img src=x onerror='alert(1)'>";

// ✅ SAFE - HTML escaped
const safe = sanitize(unsafe, 'text');
// Output: "&lt;img src=x onerror='alert(1)'&gt;"
```

---

## Secure File Uploads

### Basic Example
```typescript
import { upload } from "princejs/helpers";

const app = prince();

// Use defaults: 5MB max, specific MIME types
app.post("/upload/avatar", upload(), (req) => {
  const file = req.files?.file;
  if (!file) return { error: "No file received" };
  
  return { 
    success: true, 
    name: file.name,
    size: file.size 
  };
});

app.listen(3000);
```

### Strict Configuration
```typescript
// Restrict to images only, 2MB max
app.post("/upload/profile-pic",
  upload({
    maxSize: 2 * 1024 * 1024,  // 2MB
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  }),
  async (req) => {
    const file = req.files?.file;
    
    // Additional validation: check dimensions, etc.
    const buffer = await file.arrayBuffer();
    
    // Store file securely
    // - Save with random UUID name (not user-provided)
    // - Store outside web root
    // - Use signed URLs for delivery
    
    return { success: true };
  }
);
```

### File Upload Best Practices
```typescript
import { randomUUID } from "crypto";

const uploadDir = "./uploads";

app.post("/upload",
  upload({ maxSize: 5242880, allowedTypes: ['image/jpeg', 'image/png'] }),
  async (req) => {
    const file = req.files?.file;
    
    // ✅ Use UUID instead of user-provided name
    const filename = `${randomUUID()}-${Date.now()}.${getExtension(file.type)}`;
    
    // ✅ Store outside web root
    const filepath = `${uploadDir}/${filename}`;
    
    // ✅ Write file
    await Bun.write(filepath, file);
    
    return { 
      success: true,
      id: filename  // Return ID only, not path
    };
  }
);

// Serve files with proper content-type
app.get("/files/:id", async (req) => {
  const { id } = req.params;
  const filepath = `${uploadDir}/${id}`;
  const file = Bun.file(filepath);
  
  if (!await file.exists()) {
    return new Response("Not found", { status: 404 });
  }
  
  return new Response(file, {
    headers: { 
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000"
    }
  });
});
```

---

## Environment Configuration

### Validate Required Variables
```typescript
import { validateEnv } from "princejs/helpers";

// This runs at startup and fails fast if any env var is missing
const env = validateEnv([
  'DATABASE_URL',
  'API_KEY',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'RESEND_KEY'
]);

// Now use the safely validated object
const databaseUrl = env.DATABASE_URL;
const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

console.log("✅ All environment variables configured");
```

### How to Set Environment Variables

**.env file:**
```env
DATABASE_URL=sqlite://./app.db
API_KEY=pk_test_1234567890
JWT_SECRET=your-secret-key-min-32-chars-long
CORS_ORIGIN=https://example.com
RESEND_KEY=re_xxxxxxxxxxxxxxxxxxxx
```

**Load with Bun:**
```typescript
// In your entry file
import { config } from "dotenv";
config();

// Or just use process.env - Bun reads .env automatically
```

---

## JWT Authentication

### Setup with Custom Algorithm
```typescript
import { jwt, signJWT } from "princejs/middleware";
import { auth } from "princejs/middleware";

const app = prince();

// Define your secret
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// Use HS256 (default) or specify different algorithms
app.use(jwt(JWT_SECRET, {
  algorithms: ['HS256']  // Only allow HS256
}));

// Issue tokens on login
app.post("/login", async (req) => {
  const { username, password } = req.parsedBody;
  
  // Verify credentials...
  
  // Issue token with custom algorithm
  const token = await signJWT(
    { userId: "user_123", role: "user" },
    JWT_SECRET,
    "24h",
    'HS256'  // Specify algorithm
  );
  
  return { token };
});

// Protected endpoint
app.get("/profile", auth(), (req) => {
  return { user: req.user };
});

app.listen(3000);
```

### Role-Based Access Control
```typescript
app.use(jwt(JWT_SECRET));

// Only admin role allowed
app.delete("/admin/users/:id",
  auth({ roles: ['admin'] }),
  (req) => ({
    deleted: true,
    userId: req.params.id
  })
);

// Multiple allowed roles
app.post("/moderate/content/:id",
  auth({ roles: ['admin', 'moderator'] }),
  (req) => ({
    moderated: true
  })
);
```

---

## Rate Limiting

### Basic Rate Limiting
```typescript
import { rateLimit } from "princejs/middleware";

const app = prince();

// 100 requests per 60 seconds (per IP)
app.use(rateLimit(100, 60));

app.get("/api/data", () => ({ data: [] }));

app.listen(3000);
```

### Strict Rate Limiting for Public Endpoints
```typescript
// Login endpoint: 5 attempts per 15 minutes
app.post("/login", 
  rateLimit(5, 900),  // 5 requests per 15 minutes
  (req) => ({
    token: "jwt_token"
  })
);

// Search endpoint: 30 requests per minute
app.get("/search",
  rateLimit(30, 60),
  (req) => ({
    results: []
  })
);

// Public API: 1000 requests per hour
app.get("/api", 
  rateLimit(1000, 3600),
  (req) => ({
    data: "public"
  })
);
```

---

## Header Security

### Enable All Security Headers
```typescript
import { secureHeaders } from "princejs/middleware";

const app = prince();

app.use(secureHeaders({
  xFrameOptions: "DENY",  // Prevent clickjacking
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
  permissionsPolicy: "camera=(), microphone=(), geolocation=()",
  strictTransportSecurity: "max-age=31536000; includeSubDomains; preload"
}));

app.get("/", () => ({ ok: true }));

app.listen(3000);
```

### CORS with Strict Origins
```typescript
import { cors } from "princejs/middleware";

// Only allow specific origins
app.use(cors('https://app.example.com'));

// Or multiple origins (with custom middleware):
app.use(async (req, next) => {
  const origin = req.headers.get('origin');
  const allowedOrigins = [
    'https://app.example.com',
    'https://admin.example.com'
  ];
  
  if (!allowedOrigins.includes(origin!)) {
    return new Response("Not allowed", { status: 403 });
  }
  
  return next();
});
```

---

## Database Security

### Safe Query Examples
```typescript
import { db } from "princejs/db";

const database = db.sqlite("./app.db");

// ✅ SAFE: Using parameterized queries
const user = database.get(
  "SELECT * FROM users WHERE id = ?",
  [userId]
);

// ✅ SAFE: Multiple parameters
const results = database.query(
  "SELECT * FROM users WHERE email = ? AND status = ?",
  [email, status]
);

// ❌ UNSAFE: Never concatenate strings
const unsafe = database.query(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ SAFE: Using transactions
const transfer = database.transaction(() => {
  database.run("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, fromId]);
  database.run("UPDATE accounts SET balance = balance + ? WHERE id = ?", [amount, toId]);
  return { success: true };
});

// ✅ PREPARE statements for repeated queries
const stmt = database.prepare("SELECT * FROM users WHERE id = ?");
const user1 = stmt.get(1);
const user2 = stmt.get(2);
```

### Input Validation Before Database
```typescript
import { z } from "zod";
import { validate } from "princejs/middleware";

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  name: z.string().min(2).max(255)
});

app.post("/users",
  validate(userSchema),
  (req) => {
    const { email, age, name } = req.parsedBody;
    
    // Data is validated by Zod, safe to use
    database.run(
      "INSERT INTO users (email, age, name) VALUES (?, ?, ?)",
      [email, age, name]
    );
    
    return { success: true };
  }
);
```

---

## Complete Example

### Full Secure API
```typescript
import { prince } from "princejs";
import { 
  jwt, signJWT, csrf, auth, secureHeaders, 
  rateLimit, validate, cors 
} from "princejs/middleware";
import { upload, sanitize, validateEnv } from "princejs/helpers";
import { db } from "princejs/db";
import { z } from "zod";

// Validate environment at startup
const env = validateEnv(['JWT_SECRET', 'DATABASE_URL']);

const app = prince();
const database = db.sqlite(env.DATABASE_URL);
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

// === SECURITY MIDDLEWARE ===
app.use(secureHeaders());
app.use(cors('https://app.example.com'));
app.use(rateLimit(100, 60));
app.use(jwt(JWT_SECRET));
app.use(csrf());

// === PUBLIC ENDPOINTS ===

// Health check
app.get("/health", () => ({ status: "ok" }));

// Login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

app.post("/login",
  rateLimit(5, 900),  // Strict rate limit for login
  validate(loginSchema),
  async (req) => {
    const { email, password } = req.parsedBody;
    
    // Check credentials (simplified)
    const user = database.get(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    
    if (!user || user.password !== hashPassword(password)) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Issue token
    const token = await signJWT(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      "24h"
    );
    
    return { token };
  }
);

// === PROTECTED ENDPOINTS ===

// Get profile
app.get("/profile", auth(), (req) => {
  const user = database.get(
    "SELECT id, email, name FROM users WHERE id = ?",
    [req.user.userId]
  );
  
  return { user };
});

// Update profile
const updateSchema = z.object({
  name: z.string().min(2).max(100),
  bio: z.string().max(500).optional()
});

app.put("/profile",
  auth(),
  validate(updateSchema),
  (req) => {
    const { name, bio } = req.parsedBody;
    const safeBio = sanitize(bio || '', 'text');
    
    database.run(
      "UPDATE users SET name = ?, bio = ? WHERE id = ?",
      [name, safeBio, req.user.userId]
    );
    
    return { success: true };
  }
);

// Upload avatar
app.post("/avatar",
  auth(),
  upload({ 
    maxSize: 2 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
  }),
  async (req) => {
    const file = req.files?.file;
    const filename = `avatar_${req.user.userId}_${Date.now()}.jpg`;
    
    await Bun.write(`./uploads/${filename}`, file);
    
    database.run(
      "UPDATE users SET avatar = ? WHERE id = ?",
      [filename, req.user.userId]
    );
    
    return { success: true, avatar: filename };
  }
);

// Admin endpoint
app.delete("/admin/users/:id",
  auth({ roles: ['admin'] }),
  (req) => {
    const { id } = req.params;
    
    database.run("DELETE FROM users WHERE id = ?", [id]);
    
    return { success: true, deleted: id };
  }
);

app.listen(3000, () => {
  console.log("🔒 Secure API running on http://localhost:3000");
});
```

---

## Checklist: Before Going to Production

- [ ] All environment variables configured
- [ ] CORS origin set correctly
- [ ] CSRF protection enabled
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] File uploads restricted (size + type)
- [ ] All user input validated with Zod
- [ ] All user input sanitized before display
- [ ] Database queries use parameters
- [ ] JWT algorithm configured
- [ ] HTTPS enabled (in production)
- [ ] Database has indexes on queried columns
- [ ] Error messages don't expose internals
- [ ] Logging configured (errors but not secrets)
- [ ] Backups configured
- [ ] Monitoring configured

---

**Happy and secure coding! 👑🔒**
