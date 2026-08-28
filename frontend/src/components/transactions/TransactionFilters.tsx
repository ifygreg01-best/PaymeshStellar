'use client';

/**
 * TransactionFilters — client component.
 * Synchronises group / member / date-range filters to URL query params via nuqs,
 * making filtered views shareable and reload-safe.
 */

import { useQueryStates, parseAsString, parseAsIsoDate } from 'nuqs';
import type { Group } from '@/types/api';

export interface FilterValues {
  groupId: string | null;
  member: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  order: 'asc' | 'desc';
}

interface TransactionFiltersProps {
  groups: Group[];
  /** Called whenever any filter changes */
  onChange?: (filters: FilterValues) => void;
}

const ORDER_OPTIONS = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc', label: 'Oldest first' },
] as const;

export default function TransactionFilters({ groups, onChange }: TransactionFiltersProps) {
  const [filters, setFilters] = useQueryStates(
    {
      group_id: parseAsString.withDefault(''),
      member: parseAsString.withDefault(''),
      date_from: parseAsIsoDate,
      date_to: parseAsIsoDate,
      order: parseAsString.withDefault('desc'),
    },
    {
      history: 'push',
      shallow: false,
    }
  );

  function handleChange(next: Partial<typeof filters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    onChange?.({
      groupId: merged.group_id || null,
      member: merged.member || null,
      dateFrom: merged.date_from,
      dateTo: merged.date_to,
      order: (merged.order as 'asc' | 'desc') || 'desc',
    });
  }

  function clearAll() {
    const cleared = {
      group_id: '',
      member: '',
      date_from: null,
      date_to: null,
      order: 'desc',
    };
    setFilters(cleared);
    onChange?.({
      groupId: null,
      member: null,
      dateFrom: null,
      dateTo: null,
      order: 'desc',
    });
  }

  const hasActiveFilters =
    !!filters.group_id ||
    !!filters.member ||
    !!filters.date_from ||
    !!filters.date_to ||
    filters.order !== 'desc';

  return (
    <div
      className="card p-4 space-y-4"
      role="search"
      aria-label="Transaction filters"
    >
      <div className="flex flex-wrap gap-3 items-end">
        {/* Group selector */}
        <div className="flex flex-col gap-1 min-w-[180px] flex-1">
          <label
            htmlFor="tx-filter-group"
            className="text-xs font-medium text-text-muted uppercase tracking-wide"
          >
            Group
          </label>
          <select
            id="tx-filter-group"
            value={filters.group_id ?? ''}
            onChange={(e) => handleChange({ group_id: e.target.value })}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-ring focus-visible:outline-none"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.groupId}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Member address */}
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label
            htmlFor="tx-filter-member"
            className="text-xs font-medium text-text-muted uppercase tracking-wide"
          >
            Member address
          </label>
          <input
            id="tx-filter-member"
            type="text"
            placeholder="G…"
            value={filters.member ?? ''}
            onChange={(e) => handleChange({ member: e.target.value })}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono placeholder-text-muted focus-ring focus-visible:outline-none"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="tx-filter-date-from"
            className="text-xs font-medium text-text-muted uppercase tracking-wide"
          >
            From
          </label>
          <input
            id="tx-filter-date-from"
            type="date"
            value={filters.date_from ? filters.date_from.toISOString().slice(0, 10) : ''}
            onChange={(e) =>
              handleChange({
                date_from: e.target.value ? new Date(e.target.value) : null,
              })
            }
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-ring focus-visible:outline-none"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="tx-filter-date-to"
            className="text-xs font-medium text-text-muted uppercase tracking-wide"
          >
            To
          </label>
          <input
            id="tx-filter-date-to"
            type="date"
            value={filters.date_to ? filters.date_to.toISOString().slice(0, 10) : ''}
            onChange={(e) =>
              handleChange({
                date_to: e.target.value ? new Date(e.target.value) : null,
              })
            }
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-ring focus-visible:outline-none"
          />
        </div>

        {/* Sort order */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="tx-filter-order"
            className="text-xs font-medium text-text-muted uppercase tracking-wide"
          >
            Sort
          </label>
          <select
            id="tx-filter-order"
            value={filters.order ?? 'desc'}
            onChange={(e) => handleChange({ order: e.target.value })}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-ring focus-visible:outline-none"
          >
            {ORDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="self-end rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-raised transition focus-ring focus-visible:outline-none"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Read current filter values from the URL query string (for SSR / initial render).
 * Used by the parent page to pass initial state without hydration mismatch.
 */
export function parseFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>
): FilterValues {
  const s = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v ?? '';
  };

  const dateFrom = s('date_from') ? new Date(s('date_from')) : null;
  const dateTo = s('date_to') ? new Date(s('date_to')) : null;

  return {
    groupId: s('group_id') || null,
    member: s('member') || null,
    dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : null,
    dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : null,
    order: (s('order') as 'asc' | 'desc') || 'desc',
  };
}
