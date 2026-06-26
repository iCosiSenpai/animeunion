import { SettingsView } from '@/components/settings/settings-view';
import { Suspense } from 'react';

function SettingsFallback() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsView />
    </Suspense>
  );
}
