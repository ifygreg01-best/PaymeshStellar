/**
 * API client utilities for PaymeshStellar frontend.
 *
 * All fetches are authenticated via Bearer token.
 * Cursor pagination helpers ensure no duplicate concurrent requests.
 */

import type {
  CursorPage,
  DashboardStats,
  DashboardStatsResponse,
  Group,
  PaginatedGroups,
  PaginatedTransactions,
  Transaction,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

/** Default page size for transaction cursor pages. */
export const DEFAULT_TX_LIMIT = 50;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a full API URL from a path (no leading slash needed). */
function apiUrl(path: string): string {
  return `${API_BASE}/api/${path.replace(/^\//, '')}`;
}

/**
 * Typed wrapper around fetch that throws a structured error on non-2xx
 * responses. Works in both RSC (Node.js) and client contexts.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body?.error?.message ?? message;
    } catch {
      // ignore parse errors
    }
    const err = new Error(message) as Error & { status: number; code?: string };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth token accessor
// ---------------------------------------------------------------------------

/**
 * In RSC contexts, get the auth token from cookies.
 * In client contexts, from localStorage or a session cookie.
 * Callers pass the token explicitly so this module stays framework-agnostic.
 */
export type AuthToken = string | undefined;

// ---------------------------------------------------------------------------
// Groups API
// ---------------------------------------------------------------------------

export interface ListGroupsOptions {
  limit?: number;
  offset?: number;
  token?: AuthToken;
}

export async function listGroups(options: ListGroupsOptions = {}): Promise<{
  groups: Group[];
  total: number;
  hasMore: boolean;
}> {
  const { limit = 50, offset = 0, token } = options;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const data = await apiFetch<PaginatedGroups>(`groups?${params}`, { token });
  return {
    groups: data.data.groups,
    total: data.data.pagination.total,
    hasMore: data.data.pagination.hasMore,
  };
}

export async function getGroup(id: string, token?: AuthToken): Promise<Group> {
  const data = await apiFetch<{ success: true; data: Group }>(`groups/${id}`, { token });
  return data.data;
}

// ---------------------------------------------------------------------------
// Transactions API
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  groupId: string;
  member?: string;
  order?: 'asc' | 'desc';
  dateFrom?: string; // ISO 8601
  dateTo?: string; // ISO 8601
  limit?: number;
  cursor?: string;
  token?: AuthToken;
}

/**
 * Fetch a single cursor page of transactions.
 * Throws if group_id is missing (required by the API).
 */
export async function fetchTransactionPage(
  filters: TransactionFilters
): Promise<CursorPage<Transaction>> {
  const { groupId, member, order, dateFrom, dateTo, limit, cursor, token } = filters;

  const params = new URLSearchParams({ group_id: groupId });
  if (member) params.set('member', member);
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const data = await apiFetch<PaginatedTransactions>(`transactions?${params}`, { token });

  return {
    items: data.data,
    nextCursor: data.pagination.nextCursor ?? null,
    hasMore: data.pagination.hasMore,
  };
}

/**
 * Async generator that yields all pages for a filter set.
 * Used by the CSV export to stream pages without buffering everything.
 *
 * @example
 *   for await (const page of allTransactionPages(filters)) {
 *     processBatch(page.items);
 *     if (cancelled) break;
 *   }
 */
export async function* allTransactionPages(
  filters: Omit<TransactionFilters, 'cursor'>,
  signal?: AbortSignal
): AsyncGenerator<CursorPage<Transaction>> {
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    if (signal?.aborted) return;

    const page = await fetchTransactionPage({
      ...filters,
      cursor: cursor ?? undefined,
      limit: filters.limit ?? DEFAULT_TX_LIMIT,
    });

    yield page;

    cursor = page.nextCursor;
    hasMore = page.hasMore;
  }
}

// ---------------------------------------------------------------------------
// Dashboard stats API
// ---------------------------------------------------------------------------

/**
 * Fetch aggregated dashboard stats from GET /api/groups/stats.
 * Requires an auth token (called from RSC with forwarded cookie/header).
 */
export async function fetchDashboardStats(token?: AuthToken): Promise<DashboardStats> {
  const data = await apiFetch<DashboardStatsResponse>('groups/stats', { token });
  return data.data;
}

// ---------------------------------------------------------------------------
// Stale cursor detection
// ---------------------------------------------------------------------------

/**
 * Wrap any cursor-page fetch to detect stale cursors.
 * A stale cursor returns either a 400/404, or an empty page after a non-empty
 * previous page – both indicate the server-side data has been invalidated.
 *
 * Returns null when the cursor is stale so callers can restart from page 1.
 */
export async function fetchPageWithStaleCursorGuard(
  filters: TransactionFilters
): Promise<CursorPage<Transaction> | null> {
  try {
    return await fetchTransactionPage(filters);
  } catch (err: unknown) {
    const apiErr = err as { status?: number };
    // 400/404 with a cursor = stale cursor
    if (filters.cursor && (apiErr.status === 400 || apiErr.status === 404)) {
      return null; // signal: stale cursor, restart from beginning
    }
    throw err;
  }
}
