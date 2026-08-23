"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const serverless_http_1 = __importDefault(require("serverless-http"));
const app_1 = require("./app");
const alertService_1 = require("./services/alertService");
const httpHandler = (0, serverless_http_1.default)(app_1.app);
const handler = async (event, context) => {
    if (event?.kind === "monitor" || event?.source === "aws.events") {
        await (0, alertService_1.monitorFloodGuard)();
        return { ok: true };
    }
    if (event?.kind === "countdown") {
        await (0, alertService_1.sendCountdownMilestone)(Number(event.milestone), String(event.procedureId));
        return { ok: true };
    }
    return httpHandler(event, context);
};
exports.handler = handler;
