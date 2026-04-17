#!/usr/bin/env bun
/**
 * Performance & Bundle Size Testing Script
 * 🚀 Run before pushing to main branch
 * 
 * Usage: bun test-performance.ts
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

const BASELINE_FILE = "./performance-baseline.json";

interface PerformanceMetrics {
  buildTime: number;
  bundleSize: Record<string, number>;
  testDuration: number;
  timestamp: string;
}

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

/**
 * Measure build time
 */
function measureBuildTime(): number {
  log.info("Building project...");
  const start = Date.now();
  try {
    execSync("bun run build", { stdio: "inherit" });
  } catch (e) {
    log.error("Build failed");
    process.exit(1);
  }
  const duration = Date.now() - start;
  log.success(`Build completed in ${duration}ms`);
  return duration;
}

/**
 * Get bundle sizes
 */
function getBundleSizes(): Record<string, number> {
  const distDir = "./dist";
  const sizes: Record<string, number> = {};

  if (!existsSync(distDir)) {
    log.error("dist directory not found. Run build first.");
    return sizes;
  }

  const files = ["prince.js", "middleware.js", "helpers.js", "scheduler.js", "client.js"];

  for (const file of files) {
    const path = `${distDir}/${file}`;
    if (existsSync(path)) {
      const buffer = readFileSync(path);
      sizes[file] = buffer.length;
    }
  }

  return sizes;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Calculate size changes
 */
function calculateSizeChange(
  current: Record<string, number>,
  baseline: Record<string, number>
): Record<string, { bytes: number; percent: number }> {
  const changes: Record<string, { bytes: number; percent: number }> = {};

  for (const file in current) {
    const currentSize = current[file];
    const baselineSize = baseline[file] || currentSize;
    const byteDiff = currentSize - baselineSize;
    const percentDiff = (byteDiff / baselineSize) * 100;

    changes[file] = {
      bytes: byteDiff,
      percent: percentDiff,
    };
  }

  return changes;
}

/**
 * Run tests
 */
function runTests(): number {
  log.info("Running tests...");
  const start = Date.now();

  try {
    execSync("bun test", { stdio: "inherit" });
  } catch (e) {
    log.error("Tests failed");
    process.exit(1);
  }

  const duration = Date.now() - start;
  log.success(`Tests completed in ${duration}ms`);
  return duration;
}

/**
 * Run security scan
 */
async function runSecurityScan(): Promise<boolean> {
  log.info("Running security checks...");

  const checks = [
    {
      name: "No hardcoded secrets",
      test: () => {
        const mainFile = readFileSync("./src/prince.ts", "utf-8");
        return !mainFile.includes("Bearer sk_") && !mainFile.includes("api_key =");
      },
    },
    {
      name: "No console.log in production code",
      test: () => {
        const files = ["./src/prince.ts", "./src/middleware.ts", "./src/helpers.ts"];
        for (const file of files) {
          const content = readFileSync(file, "utf-8");
          // Allow console.error but not console.log
          const hasLog = content.includes("console.log(");
          if (hasLog) return false;
        }
        return true;
      },
    },
    {
      name: "CORS not default to wildcard",
      test: () => {
        const content = readFileSync("./src/middleware.ts", "utf-8");
        // Check that cors default is not '*'
        return !content.includes("cors = (origin: string = '*')");
      },
    },
    {
      name: "JWT errors don't expose details",
      test: () => {
        const content = readFileSync("./src/middleware.ts", "utf-8");
        return content.includes("Invalid token") && !content.includes("console.error(\"JWT Verification Failed:\", err)");
      },
    },
  ];

  let passed = 0;
  for (const check of checks) {
    try {
      if (check.test()) {
        log.success(check.name);
        passed++;
      } else {
        log.error(check.name);
      }
    } catch (e) {
      log.error(`${check.name} - ${e}`);
    }
  }

  return passed === checks.length;
}

/**
 * Display bundle size report
 */
function displayBundleSizeReport(
  current: Record<string, number>,
  baseline?: Record<string, number>
): void {
  log.title("📦 Bundle Size Report");

  let totalSize = 0;
  for (const file in current) {
    const size = current[file];
    totalSize += size;

    if (baseline && baseline[file]) {
      const change = size - baseline[file];
      const percent = (change / baseline[file]) * 100;

      const changeStr =
        change > 0
          ? `${colors.red}+${formatBytes(change)} (+${percent.toFixed(2)}%)${colors.reset}`
          : `${colors.green}${formatBytes(change)} (${percent.toFixed(2)}%)${colors.reset}`;

      console.log(
        `  ${file.padEnd(20)} ${formatBytes(size).padStart(10)} (was ${formatBytes(baseline[file])})`
      );
      console.log(`    Change: ${changeStr}`);
    } else {
      console.log(`  ${file.padEnd(20)} ${formatBytes(size).padStart(10)}`);
    }
  }

  console.log(`\n  ${"Total".padEnd(20)} ${formatBytes(totalSize).padStart(10)}`);

  // Warn if bundle size is too large
  if (totalSize > 500 * 1024) {
    log.warning(`Bundle size is large (${formatBytes(totalSize)})`);
  } else {
    log.success(`Bundle size is optimal (${formatBytes(totalSize)})`);
  }
}

/**
 * Display performance report
 */
function displayPerformanceReport(metrics: PerformanceMetrics, baseline?: PerformanceMetrics): void {
  log.title("⚡ Performance Report");

  console.log(`Build Time:     ${Math.round(metrics.buildTime)}ms`);
  if (baseline) {
    const diff = metrics.buildTime - baseline.buildTime;
    const percent = (diff / baseline.buildTime) * 100;
    const trend = diff > 0 ? `${colors.red}↑ ${percent.toFixed(2)}%${colors.reset}` : `${colors.green}↓ ${Math.abs(percent).toFixed(2)}%${colors.reset}`;
    console.log(`  ${trend}`);
  }

  console.log(`Test Time:      ${Math.round(metrics.testDuration)}ms`);
  console.log(`Timestamp:      ${metrics.timestamp}`);
}

/**
 * Save metrics to file
 */
function saveMetrics(metrics: PerformanceMetrics): void {
  writeFileSync(BASELINE_FILE, JSON.stringify(metrics, null, 2));
  log.success(`Metrics saved to ${BASELINE_FILE}`);
}

/**
 * Load baseline metrics
 */
function loadBaseline(): PerformanceMetrics | null {
  if (!existsSync(BASELINE_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(BASELINE_FILE, "utf-8"));
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  log.title("🚀 PrinceJS Performance Testing Suite");

  // Load baseline
  const baseline = loadBaseline();
  if (baseline) {
    log.success(`Loaded baseline from ${BASELINE_FILE}`);
    console.log(`  Previous build: ${baseline.timestamp}`);
  } else {
    log.warning(`No baseline found. Creating new baseline.`);
  }

  // Run tests and measurements
  const buildTime = measureBuildTime();
  const bundleSize = getBundleSizes();
  const testDuration = runTests();
  const securityPassed = await runSecurityScan();

  // Create metrics
  const metrics: PerformanceMetrics = {
    buildTime,
    bundleSize,
    testDuration,
    timestamp: new Date().toISOString(),
  };

  // Display reports
  displayBundleSizeReport(bundleSize, baseline?.bundleSize);
  displayPerformanceReport(metrics, baseline);

  // Save new baseline
  if (!baseline) {
    saveMetrics(metrics);
  } else {
    // Compare with baseline
    log.title("📊 Comparison with Baseline");
    console.log(`Build Time Delta: ${Math.round(metrics.buildTime - baseline.buildTime)}ms`);
    console.log(`Test Time Delta:  ${Math.round(metrics.testDuration - baseline.testDuration)}ms`);
  }

  // Final status
  log.title("Final Status");
  if (securityPassed) {
    log.success("✓ All security checks passed");
  } else {
    log.error("✗ Some security checks failed");
    process.exit(1);
  }

  // Bundle size limits
  const totalSize = Object.values(bundleSize).reduce((a, b) => a + b, 0);
  const limit = 1024 * 1024; // 1MB limit

  if (totalSize > limit) {
    log.error(`Bundle size ${formatBytes(totalSize)} exceeds limit ${formatBytes(limit)}`);
    process.exit(1);
  } else {
    log.success(`Bundle size ${formatBytes(totalSize)} within limits`);
  }

  log.success("✓ Performance tests passed - safe to push!");
}

// Run main
main().catch(console.error);
