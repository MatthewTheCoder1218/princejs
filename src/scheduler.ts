// princejs/scheduler.ts

// === CRON ===
export const cron = (pattern: string, task: () => void) => {
  const [m, h] = pattern.split(" ");
  setInterval(() => {
    const now = new Date();
    if ((m === "*" || now.getMinutes() === +m) && (h === "*" || now.getHours() === +h)) task();
  }, 60_000);
};

// === OPENAPI ===
export const openapi = (info: { title: string; version: string }) => {
  return { openapi: "3.0.0", info, paths: {} };
};