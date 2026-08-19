import { callGradingJob } from './src/jobs/callGradingJob';
import { callHygieneService } from './src/services/callHygieneService';

(async () => {
  const start = Date.now();
  try {
    await callGradingJob.run();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`GRADING JOB COMPLETED in ${elapsed}s`);

    // Force a fresh hygiene recompute so qualityScore reflects what was just graded
    const result = await callHygieneService.getHygieneMetrics(true);
    const withScore = result.metrics.filter((m: any) => m.qualityScore !== null);
    console.log(`\nUsers with a real qualityScore now: ${withScore.length}/${result.metrics.length}`);
    for (const m of withScore.slice(0, 10)) {
      console.log(`  ${m.userEmail}: qualityScore=${m.qualityScore} coverage=${JSON.stringify(m.qualityCoverage)}`);
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`FAILED after ${elapsed}s:`, err.message);
  }
  process.exit(0);
})();
