import { callGradingJob } from './src/jobs/callGradingJob';

(async () => {
  const start = Date.now();
  try {
    await callGradingJob.run();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`GRADING JOB COMPLETED in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`GRADING JOB FAILED after ${elapsed}s:`, err.message);
  }
  process.exit(0);
})();
