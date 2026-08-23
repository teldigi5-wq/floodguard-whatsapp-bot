import "dotenv/config";
import { app } from "./app";
import { config } from "./config";
app.listen(config.port, () => console.log(`FloodGuard bot listening on http://localhost:${config.port}`));
