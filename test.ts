// server.ts - Your PrinceJS Server
import { prince } from "./src/prince";
import { cron } from "./src/scheduler";

const app = prince();

// Routes
app.get("/", () => ({ message: "Hello!" }));
app.get("/users/:id", (req) => ({ userId: req.params.id }));

cron("*/2 * * * *", () => {
  console.log("CRON: Backup running every 2 minutes");
});

app.listen(5000);