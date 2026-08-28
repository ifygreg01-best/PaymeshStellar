'use client';

/**
 * TransactionTable — virtualized, cursor-paginated transaction list.
 *
 * Behaviour:
 * - Uses @tanstack/react-virtual to keep only visible rows in the DOM (stays
 *   correct past 10,000 rows; scrolling stays smooth).
 * - Cursor-based infinite scroll via IntersectionObserver; the sentinel
 *   element at the bottom of the list triggers the next page fetch.
 * - An in-flight ref prevents duplicate concurrent requests on rapid scroll.
 * - Sortable date column mapped to the API's `order` param.
 * - Visually distinct empty state vs loading state.
 * - Stale cursor surfaces a recoverable "Reload" action.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchPageWithStaleCursorGuard } from '@/lib/api';
import { formatAmount } from '@/lib/money';
import type { Transaction } from '@/types/api';
import type { FilterValues } from './TransactionFilters';
import LoadingSkeleton from '@/components/LoadingSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortOrder = 'asc' | 'desc';

interface TransactionTableProps {
  /** Required: the group_id to scope transactions to */
  groupId: string;
  /** Current filter values (member, date range, order come from URL state) */
  filters: FilterValues;
  /** Auth token forwarded from the parent */
  token?: string;
  /**
   * Called whenever the loaded transaction list changes (after each page load).
   * Consumers can use this to build derived data (e.g. chart data, totals)
   * from the currently loaded rows without re-fetching.
   */
  onTransactionsLoaded?: (transactions: Transaction[]) => void;
}

// Fixed row height keeps virtualization accurate (no layout thrash)
const ROW_HEIGHT = 52;
const PAGE_SIZE = 50;
// Viewport height for the scrollable container
const CONTAINER_HEIGHT = 520;

// ---------------------------------------------------------------------------
// Loading skeleton rows
// ---------------------------------------------------------------------------

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <tbody aria-busy="true" aria-label="Loading transactions">
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border" style={{ height: ROW_HEIGHT }}>
          <td className="px-4 py-3">
            <LoadingSkeleton shape="line" width="80%" height="h-4" />
          </td>
          <td className="px-4 py-3">
            <LoadingSkeleton shape="line" width="60%" height="h-4" />
          </td>
          <td className="px-4 py-3">
            <LoadingSkeleton shape="line" width="90%" height="h-4" />
          </td>
          <td className="px-4 py-3">
            <LoadingSkeleton shape="line" width="50%" height="h-4" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <tbody>
      <tr>
        <td colSpan={4}>
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised"
              aria-hidden="true"
            >
              <svg
                className="h-7 w-7 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
                />
              </svg>
            </div>
            <p className="font-medium text-text-primary">
              {hasFilters ? 'No transactions match your filters' : 'No transactions yet'}
            </p>
            <p className="text-sm text-text-muted max-w-xs">
              {hasFilters
                ? 'Try adjusting or clearing your filters to see more results.'
                : 'Transactions will appear here once payments have been distributed.'}
            </p>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

// ---------------------------------------------------------------------------
// Single row (memo-ised)
// ---------------------------------------------------------------------------

const TxRow = React.memo(function TxRow({
  tx,
  style,
}: {
  tx: Transaction;
  style: React.CSSProperties;
}) {
  const date = new Date(tx.timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const membersLabel =
    tx.membersInvolved.length === 1
      ? `${tx.membersInvolved[0].slice(0, 8)}…`
      : `${tx.membersInvolved.length} members`;

  return (
    <tr
      style={style}
      className="absolute inset-x-0 flex w-full items-center border-b border-border transition hover:bg-surface-raised"
    >
      <td className="w-[22%] shrink-0 px-4 py-3 text-sm text-text-secondary tabular-nums">
        {date}
      </td>
      <td className="w-[22%] shrink-0 px-4 py-3 text-sm font-semibold text-text-primary tabular-nums">
        {formatAmount(tx.amount, tx.asset)}
      </td>
      <td className="w-[18%] shrink-0 px-4 py-3">
        <span className="badge badge-primary">{tx.asset}</span>
      </td>
      <td className="flex-1 px-4 py-3 text-xs text-text-muted font-mono truncate">
        {membersLabel}
      </td>
      <td className="w-[18%] shrink-0 px-4 py-3 text-xs text-text-muted font-mono truncate">
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary-600 transition"
          title={tx.txHash}
        >
          {tx.txHash.slice(0, 8)}…
        </a>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TransactionTable({
  groupId,
  filters,
  token,
  onTransactionsLoaded,
}: TransactionTableProps) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleCursor, setStaleCursor] = useState(false);

  // Prevent concurrent fetches
  const fetchingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Notify parent whenever rows change
  useEffect(() => {
    onTransactionsLoaded?.(rows);
  }, [rows, onTransactionsLoaded]);

  // Derive sort order from filters
  const order: SortOrder = filters.order ?? 'desc';

  // ---------------------------------------------------------------------------
  // Fetch a page
  // ---------------------------------------------------------------------------
  const loadPage = useCallback(
    async (nextCursor: string | null, isReset: boolean) => {
      if (fetchingRef.current) return;
      if (!groupId) return;

      fetchingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const page = await fetchPageWithStaleCursorGuard({
          groupId,
          member: filters.member ?? undefined,
          dateFrom: filters.dateFrom?.toISOString(),
          dateTo: filters.dateTo?.toISOString(),
          order,
          limit: PAGE_SIZE,
          cursor: nextCursor ?? undefined,
          token,
        });

        if (page === null) {
          // Stale cursor – restart from beginning
          setStaleCursor(true);
          setRows([]);
          setCursor(null);
          setHasMore(true);
          return;
        }

        setStaleCursor(false);
        if (isReset) {
          setRows(page.items);
        } else {
          setRows((prev) => [...prev, ...page.items]);
        }
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load transactions';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
        fetchingRef.current = false;
      }
    },
    [groupId, filters.member, filters.dateFrom, filters.dateTo, order, token]
  );

  // ---------------------------------------------------------------------------
  // Reset on filter / groupId change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setRows([]);
    setCursor(null);
    setHasMore(true);
    setIsInitialLoad(true);
    setError(null);
    setStaleCursor(false);
    loadPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, filters.member, filters.dateFrom, filters.dateTo, order]);

  // ---------------------------------------------------------------------------
  // IntersectionObserver sentinel
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading && !fetchingRef.current) {
          loadPage(cursor, false);
        }
      },
      { root: scrollRef.current, rootMargin: '200px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, isLoading, loadPage]);

  // ---------------------------------------------------------------------------
  // Virtualizer
  // ---------------------------------------------------------------------------
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasFilters =
    !!filters.member || !!filters.dateFrom || !!filters.dateTo;

  const showEmpty = !isInitialLoad && !isLoading && rows.length === 0 && !error;

  return (
    <div className="card overflow-hidden" role="region" aria-label="Transaction history">
      {/* Stale cursor banner */}
      {staleCursor && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm dark:border-warning-800 dark:bg-warning-950"
        >
          <span className="text-warning-700 dark:text-warning-300">
            Your pagination state is stale. The list has been reset.
          </span>
          <button
            type="button"
            onClick={() => loadPage(null, true)}
            className="rounded-lg border border-warning-300 bg-warning-100 px-3 py-1 text-xs font-medium text-warning-700 hover:bg-warning-200 transition dark:border-warning-700 dark:bg-warning-900 dark:text-warning-300"
          >
            Reload
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-error-200 bg-error-50 px-4 py-2 text-sm dark:border-error-800 dark:bg-error-950"
        >
          <span className="text-error-700 dark:text-error-300">{error}</span>
          <button
            type="button"
            onClick={() => loadPage(cursor, false)}
            className="rounded-lg border border-error-300 bg-error-100 px-3 py-1 text-xs font-medium text-error-700 hover:bg-error-200 transition dark:border-error-700 dark:bg-error-900 dark:text-error-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table header */}
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-sm" aria-label="Transactions">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '18%' }} />
            <col />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead className="bg-surface-raised border-b border-border">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
              >
                Amount
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
              >
                Asset
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
              >
                Members
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
              >
                Tx Hash
              </th>
            </tr>
          </thead>

          {isInitialLoad ? (
            <TableSkeleton />
          ) : showEmpty ? (
            <EmptyState hasFilters={hasFilters} />
          ) : null}
        </table>
      </div>

      {/* Virtualized scrollable body */}
      {!isInitialLoad && rows.length > 0 && (
        <div
          ref={scrollRef}
          style={{ height: CONTAINER_HEIGHT, overflowY: 'auto' }}
          role="presentation"
        >
          <div style={{ position: 'relative', height: totalHeight }}>
            <table
              className="min-w-full table-fixed text-sm"
              aria-rowcount={rows.length}
              aria-label="Transaction rows"
            >
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col />
                <col style={{ width: '18%' }} />
              </colgroup>
              <tbody>
                {virtualItems.map((item) => (
                  <TxRow
                    key={rows[item.index].id}
                    tx={rows[item.index]}
                    style={{
                      top: item.start,
                      height: item.size,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Sentinel for IntersectionObserver */}
          <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
        </div>
      )}

      {/* Footer: row count + load-more indicator */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted bg-surface-raised">
        <span>
          {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''} loaded
        </span>
        {isLoading && !isInitialLoad && (
          <span className="flex items-center gap-1.5" role="status" aria-live="polite">
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            Loading more…
          </span>
        )}
        {!hasMore && rows.length > 0 && (
          <span>All transactions loaded</span>
        )}
      </div>
    </div>
  );
}
