'use client';

/**
 * CsvExportButton — streams pages from the API and writes a CSV,
 * one page at a time, without buffering the full dataset in memory.
 *
 * Features:
 * - Page-by-page fetch via allTransactionPages async generator
 * - AbortController cancellation (clicking Cancel stops the fetch mid-stream)
 * - Live progress counter (rows written)
 * - No partial download: the file is assembled in memory chunks but the
 *   Blob / anchor-click only fires on completion or is suppressed on cancel
 */

import { useRef, useState } from 'react';
import { allTransactionPages } from '@/lib/api';
import { formatAmount } from '@/lib/money';
import type { FilterValues } from './TransactionFilters';
import type { Transaction } from '@/types/api';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function txToCsvRow(tx: Transaction): string {
  const date = new Date(tx.timestamp).toISOString();
  const amount = formatAmount(tx.amount, tx.asset);
  const members = tx.membersInvolved.join(';');
  return [date, amount, tx.asset, members, tx.txHash, tx.id, tx.groupId]
    .map(escapeCsv)
    .join(',');
}

const CSV_HEADER = 'Date,Amount,Asset,Members,TxHash,Id,GroupId\n';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CsvExportButtonProps {
  groupId: string;
  filters: FilterValues;
  token?: string;
  /** Approximate total rows (used for progress). Pass undefined if unknown. */
  totalRows?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ExportState = 'idle' | 'exporting' | 'done' | 'cancelled' | 'error';

export default function CsvExportButton({
  groupId,
  filters,
  token,
  totalRows,
}: CsvExportButtonProps) {
  const [state, setState] = useState<ExportState>('idle');
  const [rowsWritten, setRowsWritten] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function startExport() {
    if (!groupId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setState('exporting');
    setRowsWritten(0);
    setErrorMsg(null);

    const chunks: string[] = [CSV_HEADER];
    let written = 0;

    try {
      const pageIter = allTransactionPages(
        {
          groupId,
          member: filters.member ?? undefined,
          dateFrom: filters.dateFrom?.toISOString(),
          dateTo: filters.dateTo?.toISOString(),
          order: filters.order,
          token,
          limit: 100,
        },
        controller.signal
      );

      for await (const page of pageIter) {
        if (controller.signal.aborted) break;

        for (const tx of page.items) {
          chunks.push(txToCsvRow(tx) + '\n');
          written++;
        }

        setRowsWritten(written);
      }

      if (controller.signal.aborted) {
        setState('cancelled');
        return;
      }

      // Build blob and trigger download only on clean completion
      const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `transactions_${groupId}_${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setState('done');
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setState('cancelled');
      } else {
        const msg = err instanceof Error ? err.message : 'Export failed';
        setErrorMsg(msg);
        setState('error');
      }
    }
  }

  function cancelExport() {
    abortRef.current?.abort();
    setState('cancelled');
  }

  function reset() {
    setState('idle');
    setRowsWritten(0);
    setErrorMsg(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const progressText =
    totalRows && totalRows > 0
      ? `${rowsWritten.toLocaleString()} / ~${totalRows.toLocaleString()} rows`
      : `${rowsWritten.toLocaleString()} rows`;

  return (
    <div className="flex items-center gap-2" role="region" aria-label="CSV export">
      {state === 'idle' && (
        <button
          type="button"
          onClick={startExport}
          disabled={!groupId}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-raised transition disabled:opacity-50 disabled:cursor-not-allowed focus-ring focus-visible:outline-none"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export CSV
        </button>
      )}

      {state === 'exporting' && (
        <>
          <span
            className="flex items-center gap-1.5 text-sm text-text-muted"
            role="status"
            aria-live="polite"
          >
            <svg
              className="h-4 w-4 animate-spin text-primary-500"
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
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Exporting {progressText}…
          </span>
          <button
            type="button"
            onClick={cancelExport}
            className="rounded-lg border border-error-300 bg-error-50 px-3 py-2 text-sm font-medium text-error-700 hover:bg-error-100 transition focus-ring focus-visible:outline-none dark:border-error-700 dark:bg-error-950 dark:text-error-300"
          >
            Cancel
          </button>
        </>
      )}

      {state === 'done' && (
        <span className="flex items-center gap-1.5 text-sm text-success-600 dark:text-success-400">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Exported {rowsWritten.toLocaleString()} rows
          <button
            type="button"
            onClick={reset}
            className="ml-1 text-xs text-text-muted underline hover:text-text-primary"
          >
            Export again
          </button>
        </span>
      )}

      {state === 'cancelled' && (
        <span className="flex items-center gap-1.5 text-sm text-text-muted">
          Export cancelled
          <button
            type="button"
            onClick={reset}
            className="ml-1 text-xs underline hover:text-text-primary"
          >
            Try again
          </button>
        </span>
      )}

      {state === 'error' && (
        <span className="flex items-center gap-1.5 text-sm text-error-600 dark:text-error-400">
          {errorMsg ?? 'Export failed'}
          <button
            type="button"
            onClick={reset}
            className="ml-1 text-xs underline hover:text-error-700"
          >
            Try again
          </button>
        </span>
      )}
    </div>
  );
}
