import serverless from "serverless-http";
import { app } from "./app";
import { monitorFloodGuard, sendCountdownMilestone } from "./services/alertService";

const httpHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  if (event?.kind === "monitor" || event?.source === "aws.events") {
    await monitorFloodGuard();
    return { ok: true };
  }
  if (event?.kind === "countdown") {
    await sendCountdownMilestone(Number(event.milestone), String(event.procedureId));
    return { ok: true };
  }
  return httpHandler(event, context);
};
