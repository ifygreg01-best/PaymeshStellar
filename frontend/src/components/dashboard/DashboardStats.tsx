/**
 * DashboardStats — React Server Component.
 * Fetches /api/groups/stats and renders summary tiles.
 * Wrapped in Suspense by the parent with <DashboardStatsSkeleton />.
 */

import { cookies } from 'next/headers';
import { fetchDashboardStats } from '@/lib/api';
import { formatAmount } from '@/lib/money';
import type { DashboardStats as DashboardStatsType } from '@/types/api';
import LoadingSkeleton from '@/components/LoadingSkeleton';

// ---------------------------------------------------------------------------
// Skeleton (exported so the parent Suspense fallback can reuse it)
// ---------------------------------------------------------------------------

export function DashboardStatsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading dashboard statistics"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="card flex flex-col gap-3 p-5"
          role="status"
          aria-label="Loading"
        >
          <LoadingSkeleton shape="line" width="60%" height="h-4" />
          <LoadingSkeleton shape="line" width="40%" height="h-8" />
          <LoadingSkeleton shape="line" width="80%" height="h-3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'blue' | 'purple' | 'amber';
}) {
  const accentClasses: Record<NonNullable<typeof accent>, string> = {
    green: 'text-success-600 dark:text-success-400',
    blue: 'text-primary-600 dark:text-primary-400',
    purple: 'text-purple-600 dark:text-purple-400',
    amber: 'text-warning-600 dark:text-warning-400',
  };
  const valueClass = accent ? accentClasses[accent] : 'text-text-primary';

  return (
    <div className="card flex flex-col gap-1 p-5">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | undefined> {
  try {
    const jar = await cookies();
    return jar.get('auth_token')?.value;
  } catch {
    return undefined;
  }
}

export default async function DashboardStats() {
  let stats: DashboardStatsType;

  try {
    const token = await getToken();
    stats = await fetchDashboardStats(token);
  } catch {
    // Graceful degradation: show zeros rather than crashing the whole page
    stats = {
      groupCount: 0,
      memberCount: 0,
      totalDistributed: [],
      lastDistribution: null,
    };
  }

  const lastDistDate = stats.lastDistribution
    ? new Date(stats.lastDistribution).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Never';

  // Build one tile per token, or a single "—" tile if nothing distributed yet
  const distributionTiles =
    stats.totalDistributed.length > 0
      ? stats.totalDistributed.map((t) => (
          <StatTile
            key={t.asset}
            label={`Total Distributed (${t.asset})`}
            value={formatAmount(t.totalAmount, t.asset)}
            sub={`Last: ${lastDistDate}`}
            accent="green"
          />
        ))
      : [
          <StatTile
            key="none"
            label="Total Distributed"
            value="—"
            sub="No distributions yet"
            accent="green"
          />,
        ];

  return (
    <section aria-label="Dashboard statistics">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Payroll Groups"
          value={stats.groupCount.toLocaleString()}
          accent="blue"
        />
        <StatTile
          label="Total Members"
          value={stats.memberCount.toLocaleString()}
          accent="purple"
        />
        {distributionTiles}
      </div>
    </section>
  );
}
