import type { FollowStatus } from '@animeunion/shared';

export interface FollowStatusMeta {
  value: FollowStatus;
  label: string;
  hint: string;
}

export const FOLLOW_STATUSES: FollowStatusMeta[] = [
  {
    value: 'watching',
    label: 'In corso',
    hint: 'Nuovi episodi possono essere scaricati automaticamente se Auto-download è attivo.',
  },
  {
    value: 'plan_to_watch',
    label: 'Da guardare',
    hint: 'Segnalato come interesse: non scarica automaticamente, ma riceve le novità.',
  },
  {
    value: 'on_hold',
    label: 'In pausa',
    hint: 'Momentaneamente in pausa: nessun download automatico e nessuna notifica.',
  },
  {
    value: 'completed',
    label: 'Completato',
    hint: 'Serie finita: mostrata in libreria, nessun download automatico.',
  },
  {
    value: 'dropped',
    label: 'Droppato',
    hint: 'Abbandonato: escluso da auto-download e notifiche.',
  },
];

export const FOLLOW_STATUS_LABELS: Record<FollowStatus, string> = Object.fromEntries(
  FOLLOW_STATUSES.map((status) => [status.value, status.label]),
) as Record<FollowStatus, string>;
