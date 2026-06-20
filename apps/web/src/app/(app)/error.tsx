'use client';

import { ErrorReport } from '@/components/shared/error-report';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorReport error={error} reset={reset} />;
}
