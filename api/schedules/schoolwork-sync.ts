import { handleSchedule } from '@vercel/schedules';
import { runAutomatedSchoolworkPipeline } from '../../src/schoolwork/cloudSyncRunner.js';

export const POST = handleSchedule(async (metadata) => {
  console.log(
    `[schoolwork-hourly-sync] execution=${metadata.executionId} scheduledAt=${metadata.scheduledAt.toISOString()}`
  );
  await runAutomatedSchoolworkPipeline();
});
