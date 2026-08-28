'use client';

/**
 * TransactionsContent — client component containing all interactive logic.
 * Separated from page.tsx so the page shell can remain a server component
 * and provide a Suspense boundary around useSearchParams() (via nuqs).
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryStates, parseAsString, parseAsIsoDate } from 'nuqs';
import Link from 'next/link';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTable from '@/components/transactions/TransactionTable';
import CsvExportButton from '@/components/transactions/CsvExportButton';
import DistributionChart from '@/components/dashboard/DistributionChart';
import { listGroups } from '@/lib/api';
import { formatAmount } from '@/lib/money';
import type { Group, DistributionDataPoint, Transaction } from '@/types/api';
import type { FilterValues } from '@/components/transactions/TransactionFilters';

// ---------------------------------------------------------------------------
// Build DistributionDataPoint[] from the transactions already in the table
// ---------------------------------------------------------------------------

function buildChartData(transactions: Transaction[]): DistributionDataPoint[] {
  // key: "YYYY-MM-DD|asset"  →  member → cumulative bigint amount
  const dayMap = new Map<string, Map<string, bigint>>();

  for (const tx of transactions) {
    const day = tx.timestamp.slice(0, 10);
    const key = `${day}|${tx.asset}`;

    if (!dayMap.has(key)) dayMap.set(key, new Map<string, bigint>());
    const memberMap = dayMap.get(key)!;

    for (const member of tx.membersInvolved) {
      const prev = memberMap.get(member) ?? 0n;
      try {
        // Distribute amount evenly across involved members (approximation).
        // Real per-member amounts require contract event data.
        memberMap.set(
          member,
          prev + BigInt(tx.amount) / BigInt(tx.membersInvolved.length)
        );
      } catch {
        // malformed amount — skip
      }
    }
  }

  const points: DistributionDataPoint[] = [];
  for (const [key, memberMap] of dayMap.entries()) {
    const [date, asset] = key.split('|');
    points.push({
      date,
      asset,
      distributions: Array.from(memberMap.entries()).map(([member, amount]) => ({
        member,
        amount: amount.toString(),
      })),
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TransactionsContent() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [loadedTransactions, setLoadedTransactions] = useState<Transaction[]>([]);

  // URL filter state via nuqs
  const [urlFilters] = useQueryStates(
    {
      group_id: parseAsString.withDefault(''),
      member: parseAsString.withDefault(''),
      date_from: parseAsIsoDate,
      date_to: parseAsIsoDate,
      order: parseAsString.withDefault('desc'),
    },
    { history: 'push', shallow: false }
  );

  const filters: FilterValues = {
    groupId: urlFilters.group_id || null,
    member: urlFilters.member || null,
    dateFrom: urlFilters.date_from,
    dateTo: urlFilters.date_to,
    order: (urlFilters.order as 'asc' | 'desc') || 'desc',
  };

  const activeGroupId = filters.groupId ?? groups[0]?.groupId ?? '';

  // Load groups for the filter dropdown
  useEffect(() => {
    let cancelled = false;

    listGroups({ limit: 100 })
      .then(({ groups: g }) => {
        if (!cancelled) {
          setGroups(g);
        }
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTransactionsLoaded = useCallback((txs: Transaction[]) => {
    setLoadedTransactions(txs);
  }, []);

  const chartData = buildChartData(loadedTransactions);
  const selectedGroup = groups.find((g) => g.groupId === activeGroupId);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-text-muted">
          <li>
            <Link href="/dashboard" className="hover:text-text-primary transition">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary font-medium" aria-current="page">
            Transaction History
          </li>
        </ol>
      </nav>

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaction History</h1>
          <p className="mt-1 text-sm text-text-muted">
            {selectedGroup
              ? `Showing transactions for "${selectedGroup.name}"`
              : activeGroupId
                ? `Group: ${activeGroupId}`
                : 'Select a group to view transactions.'}
          </p>
        </div>
        {activeGroupId && (
          <CsvExportButton groupId={activeGroupId} filters={filters} />
        )}
      </div>

      {/* Filters */}
      <TransactionFilters
        groups={groupsLoading ? [] : groups}
        onChange={() => {
          setLoadedTransactions([]);
        }}
      />

      {/* Table + chart */}
      {activeGroupId ? (
        <div className="space-y-6">
          <TransactionTable
            groupId={activeGroupId}
            filters={filters}
            onTransactionsLoaded={handleTransactionsLoaded}
          />
          <DistributionChart data={chartData} />
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center">
          <svg
            className="h-12 w-12 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
            />
          </svg>
          <p className="text-base font-medium text-text-primary">No group selected</p>
          <p className="text-sm text-text-muted max-w-sm">
            Use the Group filter above to select a payroll group and view its transaction history.
          </p>
          {!groupsLoading && groups.length === 0 && (
            <Link
              href="/groups"
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition"
            >
              Create a group →
            </Link>
          )}
        </div>
      )}

      {/* Token totals (from currently loaded rows) */}
      {loadedTransactions.length > 0 && (
        <TokenSummary transactions={loadedTransactions} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token summary
// ---------------------------------------------------------------------------

function TokenSummary({ transactions }: { transactions: Transaction[] }) {
  const totals = new Map<string, bigint>();

  for (const tx of transactions) {
    const prev = totals.get(tx.asset) ?? 0n;
    try {
      totals.set(tx.asset, prev + BigInt(tx.amount));
    } catch {
      // skip malformed
    }
  }

  if (totals.size === 0) return null;

  return (
    <section aria-label="Loaded transaction totals">
      <h2 className="mb-3 text-sm font-semibold text-text-muted uppercase tracking-wide">
        Totals (visible rows)
      </h2>
      <div className="flex flex-wrap gap-3">
        {Array.from(totals.entries()).map(([asset, total]) => (
          <div key={asset} className="card px-4 py-3 flex items-center gap-2">
            <span className="badge badge-primary">{asset}</span>
            <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
              {formatAmount(total.toString(), asset)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
