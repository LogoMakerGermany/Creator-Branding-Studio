import { dsList } from '../lib/data-store.js';
import { listUsers } from './user.service.js';
import { listFeedback } from './feedback.service.js';
import { sumApiCosts } from '../lib/api-cost.js';

export async function getAdminAnalytics() {
  const users = await listUsers();
  const jobs = await dsList('generationJobs', { orderBy: 'createdAt', order: 'desc', limit: 500 });
  const coins = await dsList('coin_transactions', { orderBy: 'createdAt', order: 'desc', limit: 500 }).catch(
    async () => dsList('coinTransactions', { orderBy: 'createdAt', order: 'desc', limit: 500 })
  );
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const moduleCounts: Record<string, number> = {};
  for (const j of jobs) {
    const m = String(j.module ?? 'unknown');
    moduleCounts[m] = (moduleCounts[m] ?? 0) + 1;
  }
  const coinsSpent = coins
    .filter((c) => c.type === 'spend')
    .reduce((sum, c) => sum + Math.abs(Number(c.amount ?? 0)), 0);
  const coinsBought = coins
    .filter((c) => c.type === 'purchase')
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  return {
    users: users.length,
    testers: users.filter((u) => u.role === 'tester').length,
    generations: jobs.length,
    completed,
    failed,
    failRate: jobs.length ? failed / jobs.length : 0,
    popularModules: Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([module, count]) => ({ module, count })),
    coinsSpent,
    coinsBought,
    apiCostCents: await sumApiCosts(),
    feedback: (await listFeedback()).length,
  };
}
