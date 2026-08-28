/**
 * Tests for TransactionTable virtualization behaviour and
 * DistributionChart accessible data-table fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock next/navigation and nuqs for component tests
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/transactions',
}));

vi.mock('nuqs', () => ({
  useQueryStates: () => [
    {
      group_id: '',
      member: '',
      date_from: null,
      date_to: null,
      order: 'desc',
    },
    vi.fn(),
  ],
  parseAsString: {
    withDefault: () => ({}),
  },
  parseAsIsoDate: {},
}));

// ---------------------------------------------------------------------------
// Import TransactionTable (default export)
// ---------------------------------------------------------------------------
import TransactionTableComponent from '@/components/transactions/TransactionTable';

const filters = {
  groupId: 'group-1',
  member: null,
  dateFrom: null,
  dateTo: null,
  order: 'desc' as const,
};

// ---------------------------------------------------------------------------
// Virtualization tests
// ---------------------------------------------------------------------------

describe('TransactionTable virtualization', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Mock IntersectionObserver — must return an object with observe/disconnect
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: observeMock,
      disconnect: disconnectMock,
      unobserve: vi.fn(),
    })) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders total row count = 10000 but virtual window << total rows in DOM', async () => {
    const TOTAL = 10_000;

    const transactions = Array.from({ length: TOTAL }, (_, i) => ({
      id: `tx-${i}`,
      groupId: 'group-1',
      amount: '10000000',
      asset: 'XLM',
      timestamp: '2024-01-01T00:00:00.000Z',
      membersInvolved: ['GABC'],
      txHash: `hash-${i}`,
    }));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: transactions,
        pagination: { limit: 10000, nextCursor: null, hasMore: false },
      }),
    } as unknown as Response);

    const { container } = render(
      React.createElement(TransactionTableComponent, {
        groupId: 'group-1',
        filters,
      })
    );

    // Wait for data to load — footer shows "10,000 rows loaded"
    await waitFor(
      () => {
        expect(screen.getByText(/10,000/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // The virtual scroll container shows a total height for all 10k rows
    // but only renders a small window. The totalHeight div should be 520000px
    // (10000 rows × 52px ROW_HEIGHT)
    const heightDiv = container.querySelector('[style*="position: relative"]');
    expect(heightDiv).toBeInTheDocument();
    expect(heightDiv?.getAttribute('style')).toContain('520000px');

    // DOM rows rendered are far fewer than 10,000 (jsdom has no scrollable viewport,
    // so react-virtual renders its overscan window only — typically ~10-20 rows)
    const virtualRows = container.querySelectorAll('tr[style*="position: absolute"]');
    expect(virtualRows.length).toBeLessThan(TOTAL);
  });

  it('shows a distinct loading skeleton on initial load (aria-busy tbody)', async () => {
    // Never resolves — stays in loading state
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));

    render(
      React.createElement(TransactionTableComponent, {
        groupId: 'group-1',
        filters,
      })
    );

    // The skeleton is a <tbody aria-busy="true" aria-label="Loading transactions">
    // Its ARIA role is "rowgroup", not "status".
    // We can find it by its aria-label:
    const skeletonBody = screen.getByRole('rowgroup', { name: /loading transactions/i });
    expect(skeletonBody).toBeInTheDocument();
    expect(skeletonBody).toHaveAttribute('aria-busy', 'true');
  });

  it('shows empty state (not loading state) when no rows returned', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        pagination: { limit: 50, nextCursor: null, hasMore: false },
      }),
    } as unknown as Response);

    render(
      React.createElement(TransactionTableComponent, {
        groupId: 'group-1',
        filters,
      })
    );

    await waitFor(
      () => {
        expect(screen.getByText(/No transactions yet/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Loading skeleton tbody should NOT be present
    expect(screen.queryByRole('rowgroup', { name: /loading transactions/i })).not.toBeInTheDocument();
  });

  it('calls onTransactionsLoaded when rows change', async () => {
    const tx = {
      id: 'tx-1',
      groupId: 'group-1',
      amount: '10000000',
      asset: 'XLM',
      timestamp: '2024-01-01T00:00:00.000Z',
      membersInvolved: ['GABC'],
      txHash: 'hash-1',
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [tx],
        pagination: { limit: 50, nextCursor: null, hasMore: false },
      }),
    } as unknown as Response);

    const onLoaded = vi.fn();

    render(
      React.createElement(TransactionTableComponent, {
        groupId: 'group-1',
        filters,
        onTransactionsLoaded: onLoaded,
      })
    );

    await waitFor(
      () => {
        // onLoaded is called with the array; the last call should have [tx]
        const lastCall = onLoaded.mock.calls.at(-1)?.[0];
        expect(lastCall).toHaveLength(1);
      },
      { timeout: 3000 }
    );

    const lastCall = onLoaded.mock.calls.at(-1)?.[0];
    expect(lastCall[0].id).toBe('tx-1');
  });
});

// ---------------------------------------------------------------------------
// DistributionChart accessibility tests
// ---------------------------------------------------------------------------

import DistributionChart from '@/components/dashboard/DistributionChart';
import type { DistributionDataPoint } from '@/types/api';

// Mock recharts (doesn't render in jsdom)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, children),
  BarChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const CHART_DATA: DistributionDataPoint[] = [
  {
    date: '2024-06-01T00:00:00.000Z',
    asset: 'XLM',
    distributions: [
      { member: 'GABC1234', amount: '10000000' },
      { member: 'GXYZ5678', amount: '20000000' },
    ],
  },
  {
    date: '2024-06-02T00:00:00.000Z',
    asset: 'XLM',
    distributions: [
      { member: 'GABC1234', amount: '15000000' },
      { member: 'GXYZ5678', amount: '25000000' },
    ],
  },
];

describe('DistributionChart accessibility', () => {
  it('renders an accessible data table in the DOM', () => {
    render(React.createElement(DistributionChart, { data: CHART_DATA }));
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });

  it('data table has the correct number of rows (header + data)', () => {
    render(React.createElement(DistributionChart, { data: CHART_DATA }));
    // Header + 2 data rows = 3
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
  });

  it('data table contains the formatted amount values', () => {
    render(React.createElement(DistributionChart, { data: CHART_DATA }));
    // formatAmount('10000000', 'XLM') = '1 XLM'
    expect(screen.getByText('1 XLM')).toBeInTheDocument();
    // formatAmount('20000000', 'XLM') = '2 XLM'
    expect(screen.getByText('2 XLM')).toBeInTheDocument();
  });

  it('data table is accessible to screen readers (not display:none or visibility:hidden)', () => {
    const { container } = render(React.createElement(DistributionChart, { data: CHART_DATA }));

    const tableWrapper = container.querySelector('[aria-label*="Distribution data table"]');
    expect(tableWrapper).toBeInTheDocument();

    const style = tableWrapper ? window.getComputedStyle(tableWrapper) : null;
    expect(style?.display).not.toBe('none');
    expect(style?.visibility).not.toBe('hidden');
  });

  it('toggle button switches to visible table view', async () => {
    const user = userEvent.setup();
    render(React.createElement(DistributionChart, { data: CHART_DATA }));

    const toggleButton = screen.getByRole('button', { name: /show data table/i });
    await user.click(toggleButton);

    const tableWrapper = screen.getByLabelText(/Distribution data table for XLM/i);
    expect(tableWrapper).not.toHaveClass('sr-only');
  });

  it('shows empty state when no data is provided', () => {
    render(React.createElement(DistributionChart, { data: [] }));
    expect(screen.getByText(/No distribution data yet/i)).toBeInTheDocument();
  });

  it('shows skeleton when isLoading is true', () => {
    render(React.createElement(DistributionChart, { data: [], isLoading: true }));
    expect(
      screen.getByRole('status', { name: /loading distribution chart/i })
    ).toBeInTheDocument();
  });

  it('renders one chart section per asset', () => {
    const multiAssetData: DistributionDataPoint[] = [
      ...CHART_DATA,
      {
        date: '2024-06-01T00:00:00.000Z',
        asset: 'USDC',
        distributions: [{ member: 'GABC1234', amount: '5000000' }],
      },
    ];

    render(React.createElement(DistributionChart, { data: multiAssetData }));

    const toggleButtons = screen.getAllByRole('button', { name: /show data table/i });
    expect(toggleButtons).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// URL state round-trip (parseFiltersFromSearchParams)
// ---------------------------------------------------------------------------

import { parseFiltersFromSearchParams } from '@/components/transactions/TransactionFilters';

describe('parseFiltersFromSearchParams URL state round-trip', () => {
  it('round-trips groupId from URL', () => {
    expect(parseFiltersFromSearchParams({ group_id: 'my-group' }).groupId).toBe('my-group');
  });

  it('round-trips member from URL', () => {
    expect(parseFiltersFromSearchParams({ member: 'GABC1234' }).member).toBe('GABC1234');
  });

  it('round-trips date_from as a Date object', () => {
    const result = parseFiltersFromSearchParams({ date_from: '2024-06-01' });
    expect(result.dateFrom).toBeInstanceOf(Date);
    expect(result.dateFrom?.toISOString().slice(0, 10)).toBe('2024-06-01');
  });

  it('round-trips date_to as a Date object', () => {
    const result = parseFiltersFromSearchParams({ date_to: '2024-06-30' });
    expect(result.dateTo).toBeInstanceOf(Date);
    expect(result.dateTo?.toISOString().slice(0, 10)).toBe('2024-06-30');
  });

  it('round-trips order=asc', () => {
    expect(parseFiltersFromSearchParams({ order: 'asc' }).order).toBe('asc');
  });

  it('defaults order to desc when missing', () => {
    expect(parseFiltersFromSearchParams({}).order).toBe('desc');
  });

  it('returns nulls for all missing optional params', () => {
    const result = parseFiltersFromSearchParams({});
    expect(result.groupId).toBeNull();
    expect(result.member).toBeNull();
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });

  it('ignores invalid date strings', () => {
    expect(parseFiltersFromSearchParams({ date_from: 'not-a-date' }).dateFrom).toBeNull();
  });

  it('handles array search param values by using the first element', () => {
    expect(parseFiltersFromSearchParams({ group_id: ['g1', 'g2'] }).groupId).toBe('g1');
  });
});
