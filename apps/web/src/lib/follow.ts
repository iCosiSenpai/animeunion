import type { FollowStatus } from '@animeunion/shared';

export const FOLLOW_STATUSES: { value: FollowStatus; label: string }[] = [
  { value: 'plan_to_watch', label: 'Da guardare' },
  { value: 'watching', label: 'In corso' },
  { value: 'on_hold', label: 'In pausa' },
  { value: 'completed', label: 'Completato' },
  { value: 'dropped', label: 'Droppato' },
];

export const FOLLOW_STATUS_LABELS: Record<FollowStatus, string> = Object.fromEntries(
  FOLLOW_STATUSES.map((status) => [status.value, status.label]),
) as Record<FollowStatus, string>;
