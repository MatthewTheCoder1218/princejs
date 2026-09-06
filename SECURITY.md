# 🛡️ PrinceJS Security Best Practices

Complete security guide with working examples for PrinceJS v2.2.4+

**⚠️ HTTPS REQUIRED:** All examples assume HTTPS in production. Never send authentication tokens over HTTP.

---

## Quick Security Checklist

- [ ] **HTTPS Enabled** - All traffic encrypted in production
- [ ] **CSRF Protection** - Enabled with `app.use(csrf())`
- [ ] **JWT Secrets** - Strong (32+ chars), loaded from environment
- [ ] **Password Hashing** - Always use bcrypt/Argon2, never plain text
- [ ] **Rate Limiting** - Enabled on login and sensitive endpoints
- [ ] **Input Validation** - All inputs validated with Zod
- [ ] **Security Headers** - Enabled with `app.use(secureHeaders())`
- [ ] **CORS Configured** - Set to specific origins, not `*`
- [ ] **Env Variables** - Validated at startup with `validateEnv()`
- [ ] **Error Handling** - No internal details in error messages

---

## CSRF Protection

### How to Use

```typescript
import { prince } from "princejs";
import { csrf, session } from "princejs/middleware";

const app = prince();

// Enable session and CSRF
app.use(session({ secret: process.env.SESSION_SECRET! }));
app.use(csrf());

// ✅ GET endpoint - returns form with token from the csrf cookie
app.get("/form", (req) => {
  const token = req.cookies?.csrf ?? "";
  return {
    html: `
      <form method="POST" action="/submit">
        <input type="hidden" name="csrf_token" value="${token}">
        <input type="text" name="comment">
        <button type="submit">Post</button>
      </form>
      <script>
        const token = document.cookie.match(/(?:^|;\\s*)csrf=([^;]+)/)?.[1];
        document.querySelector("form").addEventListener("submit", (e) => {
          e.preventDefault();
          fetch("/submit", {
            method: "POST",
            headers: { "x-csrf-token": token },
            body: new FormData(e.target),
          });
        });
      <\/script>
    `
  };
});

// ✅ POST endpoint - token validated against the cookie by the middleware
app.post("/submit", (req) => {
  return { success: true, comment: req.parsedBody };
});
```

> The `csrf` token cookie is deliberately **not** `HttpOnly` — client JS reads it and echoes it back in the `X-CSRF-Token` header on state-changing requests. Missing or mismatched header → `403`.

### JavaScript/SPA Form Submission

```typescript
// Get CSRF token from cookie
const token = document.cookie
  .split('; ')
  .find(r => r.startsWith('csrf='))
  ?.split('=')[1];

// Submit with token in header
const response = await fetch('/api/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': token
  },
  credentials: 'include',  // Send cookies
  body: JSON.stringify({ comment: "Hello" })
});
```

---

## Password Security

### ⚠️ CRITICAL: Never Store Plain Text Passwords

Always hash passwords using bcrypt (built into Bun):

```typescript
import { password as bcrypt } from "bun";

// Registration
app.post("/register", async (req) => {
  const { email, password } = req.parsedBody;
  
  // Hash password (10 rounds default)
  const hash = await bcrypt.hash(password);
  
  // Store hash only
  database.run(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    [email, hash]
  );
  
  return { registered: true };
});

// Login
app.post("/login", async (req) => {
  const { email, password } = req.parsedBody;
  
  const user = database.get(
    "SELECT id, password_hash FROM users WHERE email = ?",
    [email]
  );
  
  if (!user || !(await bcrypt.verify(password, user.password_hash))) {
    // Don't reveal which part failed
    return { error: "Invalid credentials" };
  }
  
  // Issue token
  const token = await signJWT(
    { userId: user.id, email },
    JWT_SECRET,
    "1h"
  );
  
  return { token };
});
```

### Password Requirements

```typescript
import { z } from "zod";

const passwordSchema = z.string()
  .min(12, "Minimum 12 characters")
  .regex(/[A-Z]/, "Include uppercase")
  .regex(/[a-z]/, "Include lowercase")
  .regex(/[0-9]/, "Include number")
  .regex(/[^A-Za-z0-9]/, "Include special character");
```

---

## JWT Authentication

### ⚠️ JWT Security Best Practices

1. **Secret Key Must Be Strong**
   ```typescript
   // ❌ BAD
   const SECRET = new TextEncoder().encode("secret");
   
   // ✅ GOOD - minimum 32 characters
   const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
   ```

2. **Always Set Expiration**
   ```typescript
   // ❌ BAD - token never expires
   await signJWT(payload, SECRET, "999y");
   
   // ✅ GOOD - short-lived tokens
   await signJWT(payload, SECRET, "1h");
   ```

3. **Use HTTPS in Production**
   - Never send tokens over HTTP
   - Use secure cookies: `HttpOnly`, `Secure`, `SameSite`

4. **Whitelist Algorithms**
   ```typescript
   app.use(jwt(SECRET, { 
     algorithms: ['HS256']  // Only allow HS256
   }));
   ```

### Complete Setup

```typescript
import { jwt, signJWT, auth } from "princejs/middleware";
import { password as bcrypt } from "bun";
import { z } from "zod";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// ✅ Whitelist algorithms
app.use(jwt(SECRET, { algorithms: ['HS256'] }));

// Login endpoint
app.post("/login", async (req) => {
  const { email, password } = req.parsedBody;
  
  const user = database.get(
    "SELECT id, email, password_hash, role FROM users WHERE email = ?",
    [email]
  );
  
  if (!user || !(await bcrypt.verify(password, user.password_hash))) {
    return { error: "Invalid credentials" };
  }
  
  // Issue short-lived token
  const token = await signJWT(
    { userId: user.id, email: user.email, role: user.role },
    SECRET,
    "1h"  // Expires in 1 hour
  );
  
  return { 
    token,
    expiresIn: 3600,
    type: "Bearer"
  };
});

// Protected endpoint
app.get("/profile", 
  auth(),  // Validates token
  (req) => ({ user: req.user })
);

// Admin-only endpoint
app.delete("/admin/users/:id",
  auth({ roles: ['admin'] }),  // Checks role
  (req) => ({
    deleted: true,
    userId: req.params.id
  })
);
```

---

## Input Validation & Sanitization

### Validation with Zod

```typescript
import { validate } from "princejs/middleware";
import { z } from "zod";

const postSchema = z.object({
  title: z.string().min(5).max(200),
  content: z.string().min(10).max(5000),
  tags: z.array(z.string()).max(10)
});

app.post("/posts",
  validate(postSchema),  // Auto-validates body
  auth(),
  (req) => {
    const { title, content, tags } = req.parsedBody;
    // Data is guaranteed valid
    database.run(
      "INSERT INTO posts (title, content, tags, user_id) VALUES (?, ?, ?, ?)",
      [title, content, JSON.stringify(tags), req.user.userId]
    );
    return { success: true };
  }
);
```

### HTML Sanitization (XSS Prevention)

```typescript
import { sanitize } from "princejs/helpers";

// ❌ UNSAFE - User input has scripts
const userComment = "<img src=x onerror='alert(1)'>";

// ✅ SAFE - HTML entities escaped
const safe = sanitize(userComment, 'text');
// Result: "&lt;img src=x onerror='alert(1)'&gt;"

app.post("/comments",
  validate(z.object({ text: z.string() })),
  (req) => {
    const safeText = sanitize(req.parsedBody.text, 'text');
    database.run(
      "INSERT INTO comments (text, user_id) VALUES (?, ?)",
      [safeText, req.user.userId]
    );
    return { success: true };
  }
);
```

---

## Secure File Uploads

### Validation by Size & Type

```typescript
import { upload } from "princejs/helpers";

app.post("/upload/avatar",
  auth(),
  upload({
    maxSize: 2 * 1024 * 1024,  // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
  }),
  async (req) => {
    const file = req.files?.file;
    
    // ✅ Use random name, not user input
    const filename = `${crypto.randomUUID()}.jpg`;
    const filepath = `./uploads/${filename}`;
    
    // ✅ Store outside web root
    await Bun.write(filepath, file);
    
    // ✅ Store reference in database
    database.run(
      "UPDATE users SET avatar = ? WHERE id = ?",
      [filename, req.user.userId]
    );
    
    return { success: true, avatar: filename };
  }
);
```

### Serving Uploaded Files Safely

```typescript
app.get("/files/:id", (req) => {
  const { id } = req.params;
  
  // ✅ Validate filename (no directory traversal)
  if (!/^[a-f0-9\-]+\.(jpg|png|webp)$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  
  const file = Bun.file(`./uploads/${id}`);
  
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

### Validate at Startup

```typescript
import { validateEnv } from "princejs/helpers";

// Fails immediately if any var missing
const env = validateEnv([
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'SESSION_SECRET'
]);

// Now safe to use
const DB_URL = env.DATABASE_URL;
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
```

### .env File

```env
# Database
DATABASE_URL=sqlite://./data.db

# JWT - Generate with: crypto.getRandomValues(new Uint8Array(32))
JWT_SECRET=abcd1234efgh5678ijkl9012mnop3456

# CORS - Exact origin, not *
CORS_ORIGIN=https://app.example.com

# Session
SESSION_SECRET=zyxw4321tsrq8765ponm0123lkji0987

# Email (if using)
RESEND_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

---

## Rate Limiting

### Prevent Brute Force Attacks

```typescript
import { rateLimit } from "princejs/middleware";

const app = prince();

// ✅ Global rate limit
app.use(rateLimit(100, 60));  // 100 requests per 60 seconds

// ✅ Strict limit on login
app.post("/login",
  rateLimit(5, 900),  // 5 attempts per 15 minutes
  async (req) => {
    // Login logic...
  }
);

// ✅ Strict limit on password reset
app.post("/reset-password",
  rateLimit(3, 3600),  // 3 attempts per hour
  async (req) => {
    // Reset logic...
  }
);
```

---

## Security Headers

### Enable All Protective Headers

```typescript
import { secureHeaders } from "princejs/middleware";

app.use(secureHeaders({
  // Prevent clickjacking
  xFrameOptions: "DENY",
  
  // Strict CSP - adjust as needed
  contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  
  // Prevent device access
  permissionsPolicy: "camera=(), microphone=(), geolocation=()",
  
  // HTTPS enforcement
  strictTransportSecurity: "max-age=31536000; includeSubDomains; preload"
}));
```

### ⚠️ Fix Weak CSP Example

❌ **Too Permissive:**
```typescript
contentSecurityPolicy: "default-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

✅ **Better:**
```typescript
contentSecurityPolicy: [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",  // Only if necessary
  "img-src 'self' https:",
  "font-src 'self'",
  "connect-src 'self' https://api.example.com"
].join('; ')
```

---

## Database Security

### Use Parameterized Queries

```typescript
import { db } from "princejs/db";

const database = db.sqlite("./app.db");

// ✅ SAFE - Parameters prevent SQL injection
const user = database.get(
  "SELECT * FROM users WHERE email = ? AND active = ?",
  [email, true]
);

// ✅ SAFE - Transaction support
database.transaction(() => {
  database.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, fromId]);
  database.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, toId]);
});

// ❌ UNSAFE - Never do this
const unsafe = database.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### CORS Configuration

```typescript
import { cors } from "princejs/middleware";

// ✅ SAFE - Specific origin
app.use(cors('https://app.example.com'));

// ❌ UNSAFE - Wildcard origin
app.use(cors('*'));  // Don't do this
```

---

## Complete Secure API Example

```typescript
import { prince } from "princejs";
import { 
  jwt, signJWT, csrf, auth, rateLimit,
  validate, cors, secureHeaders, session
} from "princejs/middleware";
import { validateEnv, sanitize, upload } from "princejs/helpers";
import { password as bcrypt } from "bun";
import { db } from "princejs/db";
import { z } from "zod";

// Validate environment
const env = validateEnv(['JWT_SECRET', 'DATABASE_URL', 'SESSION_SECRET']);
const SECRET = new TextEncoder().encode(env.JWT_SECRET);

const app = prince();
const database = db.sqlite(env.DATABASE_URL);

// ======= SECURITY MIDDLEWARE =======
app.use(secureHeaders({
  contentSecurityPolicy: "default-src 'self'",
  xFrameOptions: "DENY"
}));
app.use(cors('https://example.com'));  // Your domain
app.use(rateLimit(100, 60));
app.use(session({ secret: env.SESSION_SECRET }));
app.use(csrf());
app.use(jwt(SECRET, { algorithms: ['HS256'] }));

// ======= PUBLIC ENDPOINTS =======

// Register
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12)
});

app.post("/register",
  rateLimit(5, 3600),
  validate(registerSchema),
  async (req) => {
    const { email, password } = req.parsedBody;
    const hash = await bcrypt.hash(password);
    database.run(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [email, hash]
    );
    return { registered: true };
  }
);

// Login
app.post("/login",
  rateLimit(5, 900),
  validate(z.object({ email: z.string().email(), password: z.string() })),
  async (req) => {
    const { email, password } = req.parsedBody;
    const user = database.get(
      "SELECT id, password_hash FROM users WHERE email = ?",
      [email]
    );
    if (!user || !(await bcrypt.verify(password, user.password_hash))) {
      return { error: "Invalid credentials" };
    }
    const token = await signJWT({ userId: user.id }, SECRET, "1h");
    return { token };
  }
);

// ======= PROTECTED ENDPOINTS =======

// Update profile
app.put("/profile",
  auth(),
  validate(z.object({ bio: z.string().max(500) })),
  (req) => {
    const bio = sanitize(req.parsedBody.bio, 'text');
    database.run(
      "UPDATE users SET bio = ? WHERE id = ?",
      [bio, req.user.userId]
    );
    return { success: true };
  }
);

// Upload avatar
app.post("/avatar",
  auth(),
  upload({ maxSize: 2 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png'] }),
  async (req) => {
    const file = req.files?.file;
    const filename = `${req.user.userId}_${Date.now()}.jpg`;
    await Bun.write(`./uploads/${filename}`, file);
    database.run("UPDATE users SET avatar = ? WHERE id = ?", [filename, req.user.userId]);
    return { success: true };
  }
);

app.listen(3000, () => console.log("🔒 Secure API running"));
```

---

## Pre-Production Checklist

- [ ] HTTPS enabled and configured
- [ ] All environment variables set
- [ ] JWT secrets are strong (32+ chars)
- [ ] Rate limiting configured
- [ ] CSRF protection enabled
- [ ] Security headers configured
- [ ] CORS set to specific origins
- [ ] All passwords hashed with bcrypt
- [ ] Database backups configured
- [ ] Error monitoring enabled
- [ ] All user input validated
- [ ] All user input sanitized
- [ ] No console.logs exposing data
- [ ] Dependencies up to date

---

**Ready to deploy! 👑🔒**
