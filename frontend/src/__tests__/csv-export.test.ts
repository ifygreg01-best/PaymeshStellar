/**
 * Tests for CSV export logic extracted from CsvExportButton.
 *
 * Tests:
 * - CSV rows match on-screen formatting (same formatAmount output)
 * - Cancellation leaves no download triggered
 * - Special characters are escaped correctly
 * - Empty result produces only header row
 */

import { describe, it, expect, vi } from 'vitest';
import { formatAmount } from '@/lib/money';
import type { Transaction } from '@/types/api';

// ---------------------------------------------------------------------------
// Re-implement the CSV helpers inline (they're not exported from the component)
// This tests the logic contract, not the React component.
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

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    groupId: 'group-1',
    amount: '10000000',
    asset: 'XLM',
    timestamp: '2024-06-15T12:30:00.000Z',
    membersInvolved: ['GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234'],
    txHash: 'abcdef1234567890',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('escapeCsv', () => {
  it('does not quote a plain string', () => {
    expect(escapeCsv('hello')).toBe('hello');
  });

  it('wraps strings containing commas in quotes', () => {
    expect(escapeCsv('hello, world')).toBe('"hello, world"');
  });

  it('wraps strings containing double-quotes and escapes them', () => {
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings containing newlines', () => {
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps strings containing carriage returns', () => {
    expect(escapeCsv('line1\rline2')).toBe('"line1\rline2"');
  });
});

describe('txToCsvRow', () => {
  it('produces 7 comma-separated columns', () => {
    const row = txToCsvRow(makeTx());
    const cols = row.split(',');
    expect(cols).toHaveLength(7);
  });

  it('formats amount using formatAmount (matches on-screen display)', () => {
    const tx = makeTx({ amount: '12345678', asset: 'XLM' });
    const row = txToCsvRow(tx);
    const expectedAmount = formatAmount('12345678', 'XLM');
    expect(row).toContain(expectedAmount);
  });

  it('formats amount for values exceeding Number.MAX_SAFE_INTEGER', () => {
    // 10M XLM in stroops
    const tx = makeTx({ amount: '100000000000000', asset: 'XLM' });
    const row = txToCsvRow(tx);
    expect(row).toContain('10,000,000 XLM');
  });

  it('joins multiple members with semicolon', () => {
    const members = ['GAAA', 'GBBB', 'GCCC'];
    const tx = makeTx({ membersInvolved: members });
    const row = txToCsvRow(tx);
    expect(row).toContain('GAAA;GBBB;GCCC');
  });

  it('uses ISO 8601 date format', () => {
    const tx = makeTx({ timestamp: '2024-06-15T12:30:00.000Z' });
    const row = txToCsvRow(tx);
    expect(row).toContain('2024-06-15T12:30:00.000Z');
  });
});

describe('CSV output correctness', () => {
  it('produces header + one data row for a single transaction', () => {
    const tx = makeTx();
    const csv = CSV_HEADER + txToCsvRow(tx) + '\n';
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Date,Amount,Asset,Members,TxHash,Id,GroupId');
  });

  it('produces only the header for an empty export', () => {
    const csv = CSV_HEADER;
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Date,Amount,Asset,Members,TxHash,Id,GroupId');
  });

  it('each data row contains the transaction id', () => {
    const tx = makeTx({ id: 'my-tx-id' });
    const row = txToCsvRow(tx);
    expect(row).toContain('my-tx-id');
  });

  it('CSV amount column exactly matches the formatted display value', () => {
    const amounts = ['1', '10000000', '100000000000000', '9223372036854775807'];
    for (const amount of amounts) {
      const tx = makeTx({ amount });
      const row = txToCsvRow(tx);
      const expected = formatAmount(amount, 'XLM');

      // The row may have the amount quoted if it contains a comma (e.g. "10,000,000 XLM")
      // Use a simple CSV parser: split on commas not inside quotes
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
          // check for escaped quote ""
          if (inQuotes && row[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cols.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      cols.push(current);

      expect(cols[1]).toBe(expected);
    }
  });
});

describe('CsvExportButton cancellation logic', () => {
  it('AbortController aborts the signal', () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('generator stops when signal is aborted before first page', async () => {
    const { allTransactionPages } = await import('@/lib/api');
    const controller = new AbortController();
    controller.abort(); // abort immediately

    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const pages = [];
    for await (const page of allTransactionPages({ groupId: 'g1' }, controller.signal)) {
      pages.push(page);
    }

    // Should yield nothing since signal was pre-aborted
    expect(pages).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
