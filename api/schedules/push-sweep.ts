import { handleSchedule } from '@vercel/schedules';
import { runPushAlertSweep } from '../_lib/pushServer.js';

export const POST = handleSchedule(async (metadata) => {
  const result = await runPushAlertSweep();
  console.log(
    `[push-alert-sweep] execution=${metadata.executionId} dispatched=${result.dispatched} enqueued=${result.enqueued} devices=${result.devices}`
  );
});
