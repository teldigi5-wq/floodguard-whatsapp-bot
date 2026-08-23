import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { config } from "../config";

const client = new SchedulerClient({ region: process.env.AWS_REGION });

export async function scheduleCountdown(secondsFromNow: number, milestone: number, procedureId: string) {
  if (!config.schedulerRoleArn || !config.countdownFunctionArn) {
    console.warn("Scheduler not configured; countdown milestone skipped", milestone);
    return;
  }
  const when = new Date(Date.now() + secondsFromNow * 1000);
  const at = when.toISOString().replace(/\.\d{3}Z$/, "");
  const name = `fg-${procedureId.replace(/[^a-zA-Z0-9-_]/g,"").slice(-40)}-${milestone}`;
  await client.send(new CreateScheduleCommand({
    Name: name,
    ScheduleExpression: `at(${at})`,
    FlexibleTimeWindow: { Mode: "OFF" },
    ActionAfterCompletion: "DELETE",
    Target: {
      Arn: config.countdownFunctionArn,
      RoleArn: config.schedulerRoleArn,
      Input: JSON.stringify({ kind: "countdown", milestone, procedureId })
    }
  }));
}
