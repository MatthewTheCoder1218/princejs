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
export const openapi = (info: { title: string; version: string }) => {
  return { openapi: "3.0.0", info, paths: {} };
};