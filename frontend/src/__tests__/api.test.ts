/**
 * Tests for src/lib/api.ts
 *
 * Covers:
 * - fetchPageWithStaleCursorGuard: stale cursor returns null, valid page passes through
 * - allTransactionPages generator: terminates on last page, respects abort signal
 * - fetchTransactionPage: throws on non-2xx, maps response correctly
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchPageWithStaleCursorGuard,
  allTransactionPages,
  fetchTransactionPage,
} from '@/lib/api';
import type { Transaction } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(id: string): Transaction {
  return {
    id,
    groupId: 'group-1',
    amount: '10000000',
    asset: 'XLM',
    timestamp: '2024-01-01T00:00:00.000Z',
    membersInvolved: ['GABC1234567890ABCDEF'],
    txHash: `hash-${id}`,
  };
}

function mockFetchSuccess(data: Transaction[], nextCursor: string | null, hasMore: boolean) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data,
      pagination: { limit: 50, nextCursor, hasMore },
    }),
  } as unknown as Response);
}

function mockFetchError(status: number, message = 'Error') {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  } as unknown as Response);
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// fetchTransactionPage
// ---------------------------------------------------------------------------

describe('fetchTransactionPage', () => {
  it('maps API response shape to CursorPage correctly', async () => {
    const tx = makeTx('t1');
    mockFetchSuccess([tx], 'abc', true);

    const page = await fetchTransactionPage({ groupId: 'g1' });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('abc');
    expect(page.hasMore).toBe(true);
  });

  it('returns hasMore=false and nextCursor=null on last page', async () => {
    mockFetchSuccess([makeTx('1')], null, false);

    const page = await fetchTransactionPage({ groupId: 'g1' });

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('throws with status on non-2xx responses', async () => {
    mockFetchError(403, 'Forbidden');

    await expect(fetchTransactionPage({ groupId: 'g1' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('includes all filter params in the request URL', async () => {
    mockFetchSuccess([], null, false);

    await fetchTransactionPage({
      groupId: 'my-group',
      member: 'GABC',
      order: 'asc',
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      limit: 25,
      cursor: 'cursor-xyz',
    });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('group_id=my-group');
    expect(calledUrl).toContain('member=GABC');
    expect(calledUrl).toContain('order=asc');
    expect(calledUrl).toContain('date_from=2024-01-01');
    expect(calledUrl).toContain('date_to=2024-12-31');
    expect(calledUrl).toContain('limit=25');
    expect(calledUrl).toContain('cursor=cursor-xyz');
  });
});

// ---------------------------------------------------------------------------
// fetchPageWithStaleCursorGuard
// ---------------------------------------------------------------------------

describe('fetchPageWithStaleCursorGuard', () => {
  it('returns the page on success', async () => {
    mockFetchSuccess([makeTx('1')], null, false);

    const result = await fetchPageWithStaleCursorGuard({ groupId: 'g1' });

    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(1);
  });

  it('returns null when a 400 is thrown with a cursor present (stale cursor)', async () => {
    mockFetchError(400, 'Bad cursor');

    const result = await fetchPageWithStaleCursorGuard({
      groupId: 'g1',
      cursor: 'old-cursor',
    });

    expect(result).toBeNull();
  });

  it('returns null when a 404 is thrown with a cursor present', async () => {
    mockFetchError(404, 'Not found');

    const result = await fetchPageWithStaleCursorGuard({
      groupId: 'g1',
      cursor: 'some-cursor',
    });

    expect(result).toBeNull();
  });

  it('rethrows a 400 error when no cursor is present', async () => {
    mockFetchError(400, 'Bad request');

    await expect(
      fetchPageWithStaleCursorGuard({ groupId: 'g1' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rethrows 500 errors regardless of cursor', async () => {
    mockFetchError(500, 'Server error');

    await expect(
      fetchPageWithStaleCursorGuard({ groupId: 'g1', cursor: 'c' })
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// allTransactionPages generator
// ---------------------------------------------------------------------------

describe('allTransactionPages', () => {
  it('yields all pages and terminates on the last page', async () => {
    // Page 1: has more
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [makeTx('1'), makeTx('2')],
          pagination: { limit: 50, nextCursor: 'cursor-2', hasMore: true },
        }),
      } as unknown as Response)
      // Page 2: last page
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [makeTx('3')],
          pagination: { limit: 50, nextCursor: null, hasMore: false },
        }),
      } as unknown as Response);

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(pages[0].items).toHaveLength(2);
    expect(pages[1].items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('yields a single page when hasMore is false from the start', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [makeTx('1'), makeTx('2')],
        pagination: { limit: 50, nextCursor: null, hasMore: false },
      }),
    } as unknown as Response);

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('terminates early when AbortSignal is aborted before first page', async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    global.fetch = vi.fn();

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' }, controller.signal)) {
      pages.push(page);
    }

    // Pre-aborted: should yield nothing and not call fetch
    expect(pages).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes cursor from previous page to next request', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [makeTx('1')],
          pagination: { limit: 50, nextCursor: 'the-cursor', hasMore: true },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [makeTx('2')],
          pagination: { limit: 50, nextCursor: null, hasMore: false },
        }),
      } as unknown as Response);

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    // Second call URL must include cursor=the-cursor
    const secondCallUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('cursor=the-cursor');
  });

  it('yields zero items in the single page for an empty result', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        pagination: { limit: 50, nextCursor: null, hasMore: false },
      }),
    } as unknown as Response);

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(0);
  });
});
