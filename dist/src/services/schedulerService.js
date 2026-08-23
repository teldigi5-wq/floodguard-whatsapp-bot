"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleCountdown = scheduleCountdown;
const client_scheduler_1 = require("@aws-sdk/client-scheduler");
const config_1 = require("../config");
const client = new client_scheduler_1.SchedulerClient({ region: process.env.AWS_REGION });
async function scheduleCountdown(secondsFromNow, milestone, procedureId) {
    if (!config_1.config.schedulerRoleArn || !config_1.config.countdownFunctionArn) {
        console.warn("Scheduler not configured; countdown milestone skipped", milestone);
        return;
    }
    const when = new Date(Date.now() + secondsFromNow * 1000);
    const at = when.toISOString().replace(/\.\d{3}Z$/, "");
    const name = `fg-${procedureId.replace(/[^a-zA-Z0-9-_]/g, "").slice(-40)}-${milestone}`;
    await client.send(new client_scheduler_1.CreateScheduleCommand({
        Name: name,
        ScheduleExpression: `at(${at})`,
        FlexibleTimeWindow: { Mode: "OFF" },
        ActionAfterCompletion: "DELETE",
        Target: {
            Arn: config_1.config.countdownFunctionArn,
            RoleArn: config_1.config.schedulerRoleArn,
            Input: JSON.stringify({ kind: "countdown", milestone, procedureId })
        }
    }));
}
