'use client';

/**
 * DistributionChart — stacked-bar chart of distributions over time.
 *
 * Features:
 * - Per-token breakdown; each token gets its own chart section
 * - Stacked by member for each day bucket
 * - Responsive via recharts ResponsiveContainer
 * - Light and dark mode aware (uses CSS custom properties)
 * - Accessible data-table fallback: same numbers, screen-reader reachable,
 *   hidden visually but present in the DOM (not display:none)
 * - toChartValue() used for chart rendering (Number is acceptable for display);
 *   BigInt formatAmount() used for all text/table values
 */

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { toChartValue, formatAmount } from '@/lib/money';
import type { DistributionDataPoint } from '@/types/api';

// ---------------------------------------------------------------------------
// Colour palette — cycles for up to 10 members, WCAG AA contrast on white/dark
// ---------------------------------------------------------------------------

const MEMBER_COLOURS = [
  '#6366f1', // indigo-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#3b82f6', // blue-500
  '#ec4899', // pink-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
];

function memberColour(index: number): string {
  return MEMBER_COLOURS[index % MEMBER_COLOURS.length];
}

// ---------------------------------------------------------------------------
// Shorten a Stellar address for display (G…XXXXXX)
// ---------------------------------------------------------------------------

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  payload: Record<string, number | string>;
}

function CustomTooltip({
  active,
  payload,
  label,
  asset,
  rawData,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  asset: string;
  rawData: Map<string, Map<string, string>>; // date → member → raw i128
}) {
  if (!active || !payload?.length) return null;

  const dateMap = rawData.get(label ?? '') ?? new Map<string, string>();

  return (
    <div
      className="rounded-lg border border-border bg-surface p-3 text-sm shadow-md min-w-[180px]"
      role="status"
      aria-live="polite"
    >
      <p className="mb-2 font-semibold text-text-primary">{label}</p>
      {payload.map((entry) => {
        const raw = dateMap.get(entry.name) ?? '0';
        return (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {shortAddr(entry.name)}
            </span>
            <span className="font-mono tabular-nums text-text-primary">
              {formatAmount(raw, asset)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-token chart
// ---------------------------------------------------------------------------

interface TokenChartData {
  date: string;
  [member: string]: number | string; // member address → chart number value
}

function TokenChart({
  asset,
  dataPoints,
}: {
  asset: string;
  dataPoints: DistributionDataPoint[];
}) {
  const [showTable, setShowTable] = useState(false);

  // Collect all unique members across all data points
  const allMembers = useMemo(() => {
    const set = new Set<string>();
    dataPoints.forEach((dp) => dp.distributions.forEach((d) => set.add(d.member)));
    return Array.from(set);
  }, [dataPoints]);

  // Build recharts-compatible row objects
  const chartData: TokenChartData[] = useMemo(() => {
    return dataPoints.map((dp) => {
      const row: TokenChartData = {
        date: dp.date.slice(0, 10), // YYYY-MM-DD
      };
      dp.distributions.forEach((d) => {
        row[d.member] = toChartValue(d.amount, asset);
      });
      return row;
    });
  }, [dataPoints, asset]);

  // Raw i128 strings keyed by date→member for tooltip and table
  const rawLookup = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    dataPoints.forEach((dp) => {
      const dateKey = dp.date.slice(0, 10);
      const memberMap = new Map<string, string>();
      dp.distributions.forEach((d) => memberMap.set(d.member, d.amount));
      map.set(dateKey, memberMap);
    });
    return map;
  }, [dataPoints]);

  if (dataPoints.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-text-muted">
        No distribution data for {asset}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toggle between chart and table */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{asset}</h3>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-expanded={showTable}
          aria-controls={`dist-table-${asset}`}
        >
          {showTable ? 'Show chart' : 'Show data table'}
        </button>
      </div>

      {/* Accessible data table (always in DOM, visually shown on toggle) */}
      <div
        id={`dist-table-${asset}`}
        className={showTable ? '' : 'sr-only'}
        aria-label={`Distribution data table for ${asset}`}
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-xs">
            <thead className="bg-surface-raised">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-semibold text-text-muted uppercase tracking-wide"
                >
                  Date
                </th>
                {allMembers.map((m) => (
                  <th
                    key={m}
                    scope="col"
                    className="px-3 py-2 text-right font-semibold text-text-muted uppercase tracking-wide"
                    title={m}
                  >
                    {shortAddr(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dataPoints.map((dp) => {
                const dateKey = dp.date.slice(0, 10);
                const memberMap = rawLookup.get(dateKey) ?? new Map<string, string>();
                return (
                  <tr key={dateKey} className="hover:bg-surface-raised transition">
                    <td className="px-3 py-2 text-text-secondary tabular-nums">{dateKey}</td>
                    {allMembers.map((m) => {
                      const raw = memberMap.get(m) ?? '0';
                      return (
                        <td
                          key={m}
                          className="px-3 py-2 text-right tabular-nums text-text-primary font-mono"
                        >
                          {raw === '0' ? '—' : formatAmount(raw, asset)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recharts stacked bar chart */}
      <div
        aria-hidden={showTable}
        className={showTable ? 'hidden' : ''}
        style={{ height: 280 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            aria-label={`Stacked bar chart: ${asset} distributions over time`}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border, #e2e8f0)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted, #64748b)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-muted, #64748b)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1_000
                    ? `${(v / 1_000).toFixed(1)}K`
                    : String(v)
              }
            />
            <Tooltip
              content={
                <CustomTooltip
                  asset={asset}
                  rawData={rawLookup}
                />
              }
              cursor={{ fill: 'var(--surface-raised, #f8fafc)', opacity: 0.6 }}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-text-secondary" title={value}>
                  {shortAddr(value)}
                </span>
              )}
            />
            {allMembers.map((member, idx) => (
              <Bar
                key={member}
                dataKey={member}
                stackId="dist"
                fill={memberColour(idx)}
                radius={idx === allMembers.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                name={member}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function DistributionChartSkeleton() {
  return (
    <div
      className="card p-5 space-y-3"
      aria-busy="true"
      aria-label="Loading distribution chart"
      role="status"
    >
      <div className="h-4 w-32 rounded skeleton-shimmer" />
      <div className="h-64 w-full rounded-lg skeleton-shimmer" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function ChartEmpty() {
  return (
    <div className="card flex flex-col items-center justify-center py-16 gap-3 text-center">
      <svg
        className="h-10 w-10 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2z"
        />
      </svg>
      <p className="text-sm font-medium text-text-primary">No distribution data yet</p>
      <p className="text-xs text-text-muted max-w-xs">
        Charts will appear once transactions have been distributed to group members.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface DistributionChartProps {
  /** Data points from the API or aggregated client-side */
  data: DistributionDataPoint[];
  /** Loading state — shows skeleton */
  isLoading?: boolean;
}

export default function DistributionChart({ data, isLoading }: DistributionChartProps) {
  // Group data points by asset
  const byAsset = useMemo(() => {
    const map = new Map<string, DistributionDataPoint[]>();
    data.forEach((dp) => {
      const existing = map.get(dp.asset) ?? [];
      existing.push(dp);
      map.set(dp.asset, existing);
    });
    return map;
  }, [data]);

  if (isLoading) {
    return <DistributionChartSkeleton />;
  }

  if (byAsset.size === 0) {
    return <ChartEmpty />;
  }

  return (
    <section
      aria-label="Distribution over time"
      className="card p-5 space-y-6"
    >
      <h2 className="text-base font-semibold text-text-primary">Distribution Over Time</h2>
      {Array.from(byAsset.entries()).map(([asset, points]) => (
        <TokenChart key={asset} asset={asset} dataPoints={points} />
      ))}
    </section>
  );
}
