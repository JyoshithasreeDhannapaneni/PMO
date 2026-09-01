import 'dotenv/config';
import { emailHygieneService } from './src/services/emailHygieneService';

async function main() {
  console.log('Running forced fresh sync (this scans all mailboxes, ~2-4 min)...');
  const result = await emailHygieneService.getHygieneMetrics(true);
  console.log(`Done. computedAt=${result.computedAt}, users=${result.metrics.length}`);
  const scores = result.metrics.map((m: any) => m.emailHygieneScore);
  const distinct = new Set(scores).size;
  const fiftyCount = scores.filter((s: number) => s === 50).length;
  console.log(`distinctScores=${distinct} exactly50=${fiftyCount}/${result.metrics.length}`);
  console.log('\nFull breakdown:');
  for (const m of [...result.metrics].sort((a: any, b: any) => b.emailHygieneScore - a.emailHygieneScore)) {
    console.log(`  ${m.userName}: score=${m.emailHygieneScore} threads=${m.uniqueCustomerThreads} accuracy=${m.accuracyRate} completeness=${m.completenessRate} tone=${m.toneScore} speed=${m.speedScore} quality=${m.qualityScore} resolution=${m.resolutionScore}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
