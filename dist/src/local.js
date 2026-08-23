"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const config_1 = require("./config");
app_1.app.listen(config_1.config.port, () => console.log(`FloodGuard bot listening on http://localhost:${config_1.config.port}`));
