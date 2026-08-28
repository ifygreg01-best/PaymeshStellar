/**
 * /dashboard — React Server Component page.
 *
 * Wires together:
 *  - DashboardStats (RSC) — group count, member count, total distributed per token
 *  - GroupOverviewCards (RSC) — card grid linking to /groups/[id]
 *
 * Each RSC section is wrapped in its own Suspense boundary so stats and cards
 * load independently; if one fails the other still renders.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import DashboardStats, { DashboardStatsSkeleton } from '@/components/dashboard/DashboardStats';
import GroupOverviewCards, {
  GroupOverviewCardsSkeleton,
} from '@/components/dashboard/GroupOverviewCards';

export const metadata = {
  title: 'Dashboard — PaymeshStellar',
  description: 'Overview of your payroll groups, distributions, and member activity.',
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          Overview of your payroll groups, distributions, and member activity.
        </p>
      </div>

      {/* Summary stats */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="mb-3 text-base font-semibold text-text-primary">
          Summary
        </h2>
        <Suspense fallback={<DashboardStatsSkeleton />}>
          <DashboardStats />
        </Suspense>
      </section>

      {/* Group overview cards */}
      <section aria-labelledby="groups-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="groups-heading" className="text-base font-semibold text-text-primary">
            Your Groups
          </h2>
          <Link
            href="/groups"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            View all →
          </Link>
        </div>
        <Suspense fallback={<GroupOverviewCardsSkeleton />}>
          <GroupOverviewCards />
        </Suspense>
      </section>

      {/* Quick link to transaction history */}
      <section aria-labelledby="transactions-heading">
        <h2 id="transactions-heading" className="mb-3 text-base font-semibold text-text-primary">
          Transactions
        </h2>
        <div className="card p-6 flex flex-col items-start gap-3">
          <p className="text-sm text-text-muted">
            View full transaction history with filters, CSV export, and distribution charts.
          </p>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
          >
            Open Transaction History →
          </Link>
        </div>
      </section>
    </div>
  );
}
