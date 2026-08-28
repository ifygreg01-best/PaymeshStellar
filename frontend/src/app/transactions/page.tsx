/**
 * /transactions — server-component page shell.
 *
 * Wraps TransactionsContent (client component) in a Suspense boundary.
 * This satisfies the Next.js requirement that any component using
 * useSearchParams() (via nuqs) must be wrapped in Suspense.
 */

import { Suspense } from 'react';
import TransactionsContent from './TransactionsContent';

export const metadata = {
  title: 'Transactions — PaymeshStellar',
  description: 'Full transaction history with filters, CSV export, and distribution charts.',
};

function TransactionsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading transactions page">
      <div className="h-8 w-48 rounded skeleton-shimmer" />
      <div className="h-20 w-full rounded-lg skeleton-shimmer" />
      <div className="h-64 w-full rounded-lg skeleton-shimmer" />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionsSkeleton />}>
      <TransactionsContent />
    </Suspense>
  );
}
