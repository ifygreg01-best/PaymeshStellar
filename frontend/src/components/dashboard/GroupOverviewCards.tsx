/**
 * GroupOverviewCards — React Server Component.
 * Fetches the user's groups and renders a responsive card grid,
 * each linking to the /groups/[id] detail page.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { listGroups } from '@/lib/api';
import Card from '@/components/Card';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import type { Group } from '@/types/api';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function GroupOverviewCardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading groups"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 flex flex-col gap-3" role="status" aria-label="Loading">
          <LoadingSkeleton shape="line" width="70%" height="h-5" />
          <LoadingSkeleton shape="line" width="50%" height="h-3" />
          <LoadingSkeleton shape="line" width="40%" height="h-3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single group card
// ---------------------------------------------------------------------------

function GroupCard({ group }: { group: Group }) {
  const createdAt = new Date(group.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link
      href={`/groups/${group.id}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View details for ${group.name}`}
    >
      <Card
        className="h-full transition-all duration-200 hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600"
        header={
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-text-primary leading-snug line-clamp-2">
              {group.name}
            </h3>
            <span className="badge badge-primary shrink-0 mt-0.5">
              {group.paymentToken}
            </span>
          </div>
        }
      >
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Members</dt>
            <dd className="font-medium text-text-primary tabular-nums">
              {group.membersCount}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Created</dt>
            <dd className="font-medium text-text-secondary">{createdAt}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Creator</dt>
            <dd
              className="font-mono text-xs text-text-muted truncate max-w-[140px]"
              title={group.creator}
            >
              {group.creator.slice(0, 8)}…{group.creator.slice(-6)}
            </dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyGroups() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised"
        aria-hidden="true"
      >
        <svg
          className="h-8 w-8 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0"
          />
        </svg>
      </div>
      <p className="text-base font-medium text-text-primary">No payroll groups yet</p>
      <p className="mt-1 text-sm text-text-muted">
        Create your first group to start distributing payments.
      </p>
      <Link
        href="/groups"
        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Go to Groups
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | undefined> {
  try {
    const jar = await cookies();
    return jar.get('auth_token')?.value;
  } catch {
    return undefined;
  }
}

export default async function GroupOverviewCards() {
  let groups: Group[] = [];

  try {
    const token = await getToken();
    const result = await listGroups({ limit: 12, token });
    groups = result.groups;
  } catch {
    // Graceful degradation
    groups = [];
  }

  if (groups.length === 0) {
    return (
      <section aria-label="Your payroll groups">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EmptyGroups />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your payroll groups">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}
