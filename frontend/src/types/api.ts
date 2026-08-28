// ---------------------------------------------------------------------------
// Shared API types – mirrors backend type definitions exactly.
// Keep in sync with backend/src/types/index.ts and backend/src/services/*.ts
// ---------------------------------------------------------------------------

export interface GroupMember {
  address: string;
  name: string;
  /** Percentage as a number (0–100). Maps to basis-point shares on-chain. */
  percentage: number;
}

export interface Group {
  id: string;
  groupId: string;
  name: string;
  creator: string;
  paymentToken: string;
  members: GroupMember[];
  membersCount: number;
  createdAt: string; // ISO 8601 string (serialised from Date)
}

/**
 * Transaction amount is an i128 decimal string (never a JS Number!).
 * Use formatAmount() from lib/money.ts to display it.
 */
export interface Transaction {
  id: string;
  groupId: string;
  /** i128 decimal string – may exceed Number.MAX_SAFE_INTEGER */
  amount: string;
  asset: string;
  timestamp: string; // ISO 8601 string
  membersInvolved: string[]; // Stellar addresses
  txHash: string;
}

// ---------------------------------------------------------------------------
// Paginated API response shapes
// ---------------------------------------------------------------------------

export interface PaginatedGroups {
  success: true;
  data: {
    groups: Group[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

export interface PaginatedTransactions {
  success: true;
  data: Transaction[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/** Cursor-based page result used internally by the API client. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard stats – returned by GET /api/groups/stats
// ---------------------------------------------------------------------------

export interface TokenTotal {
  asset: string;
  /** i128 decimal string – use formatAmount() to display */
  totalAmount: string;
}

export interface DashboardStats {
  groupCount: number;
  memberCount: number;
  totalDistributed: TokenTotal[];
  /** ISO 8601 string of the most recent transaction, or null if none */
  lastDistribution: string | null;
}

export interface DashboardStatsResponse {
  success: true;
  data: DashboardStats;
}

// ---------------------------------------------------------------------------
// Distribution chart data shapes
// ---------------------------------------------------------------------------

export interface MemberDistribution {
  member: string;
  /** i128 decimal string */
  amount: string;
}

export interface DistributionDataPoint {
  /** ISO 8601 date string (day granularity) */
  date: string;
  asset: string;
  distributions: MemberDistribution[];
}

// ---------------------------------------------------------------------------
// API error shape
// ---------------------------------------------------------------------------

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Token metadata
// ---------------------------------------------------------------------------

/**
 * Well-known Stellar token decimal places.
 * XLM and most Stellar assets use 7 decimal places (stroops).
 * Add entries here for custom assets with different precision.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  XLM: 7,
  USDC: 7,
  USDT: 7,
  // Default fallback: 7 (Stellar standard)
} as const;

export const DEFAULT_TOKEN_DECIMALS = 7;
