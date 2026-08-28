/**
 * /groups/[id] — Group detail page (React Server Component).
 * Shows group metadata and full member list with basis-point shares.
 */

import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getGroup } from '@/lib/api';
import type { GroupMember } from '@/types/api';

interface Props {
  params: Promise<{ id: string }>;
}

async function getToken(): Promise<string | undefined> {
  try {
    const jar = await cookies();
    return jar.get('auth_token')?.value;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

function MemberRow({ member, rank }: { member: GroupMember; rank: number }) {
  // Percentage stored as 0–100; display as basis points (× 100) for precision
  const basisPoints = Math.round(member.percentage * 100);

  return (
    <tr className="transition hover:bg-surface-raised">
      <td className="px-6 py-3 tabular-nums text-text-muted text-sm">{rank}</td>
      <td className="px-6 py-3">
        <span className="font-medium text-text-primary text-sm">
          {member.name || (
            <span className="text-text-muted italic">Unnamed</span>
          )}
        </span>
      </td>
      <td className="px-6 py-3">
        <span
          className="font-mono text-xs text-text-secondary"
          title={member.address}
        >
          {member.address.slice(0, 10)}…{member.address.slice(-8)}
        </span>
      </td>
      <td className="px-6 py-3 text-right tabular-nums text-sm font-medium text-text-primary">
        {member.percentage.toFixed(2)}%
      </td>
      <td className="px-6 py-3 text-right tabular-nums text-sm text-text-muted">
        {basisPoints} bps
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  const token = await getToken();

  let group;
  try {
    group = await getGroup(id, token);
  } catch (err: unknown) {
    const apiErr = err as { status?: number };
    if (apiErr.status === 404 || apiErr.status === 403) {
      notFound();
    }
    throw err;
  }

  const createdAt = new Date(group.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalPercentage = group.members.reduce((sum, m) => sum + m.percentage, 0);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-text-muted">
          <li>
            <Link href="/dashboard" className="hover:text-text-primary transition">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/groups" className="hover:text-text-primary transition">
              Groups
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary font-medium" aria-current="page">
            {group.name}
          </li>
        </ol>
      </nav>

      {/* Group header */}
      <div className="card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{group.name}</h1>
            <p className="mt-1 text-sm text-text-muted">Group ID: {group.groupId}</p>
          </div>
          <span className="badge badge-primary self-start">{group.paymentToken}</span>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-text-muted font-medium">Creator</dt>
            <dd
              className="mt-1 font-mono text-xs text-text-secondary truncate"
              title={group.creator}
            >
              {group.creator.slice(0, 12)}…{group.creator.slice(-8)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted font-medium">Members</dt>
            <dd className="mt-1 font-semibold text-text-primary tabular-nums">
              {group.membersCount}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted font-medium">Created</dt>
            <dd className="mt-1 text-text-secondary">{createdAt}</dd>
          </div>
        </dl>
      </div>

      {/* Members table */}
      <section aria-labelledby="members-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="members-heading" className="text-lg font-semibold text-text-primary">
            Members
          </h2>
          {/* Validation badge */}
          {Math.abs(totalPercentage - 100) < 0.01 ? (
            <span className="badge badge-success">Shares balance (100%)</span>
          ) : (
            <span className="badge badge-error">
              Shares imbalanced ({totalPercentage.toFixed(2)}%)
            </span>
          )}
        </div>

        {group.members.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-text-muted text-sm">No members in this group yet.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">
                    #
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Address
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Share
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Basis Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {group.members.map((member, idx) => (
                  <MemberRow key={member.address} member={member} rank={idx + 1} />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-surface-raised">
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-text-primary">
                    Total
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-semibold tabular-nums text-text-primary">
                    {totalPercentage.toFixed(2)}%
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-semibold tabular-nums text-text-muted">
                    {Math.round(totalPercentage * 100)} bps
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Back link */}
      <Link
        href="/groups"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Groups
      </Link>
    </div>
  );
}
