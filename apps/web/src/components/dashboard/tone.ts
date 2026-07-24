// Toni semantici condivisi dai primitivi della dashboard (StatusPill, StatCard, ...). I nomi delle
// classi sono letterali (niente concatenazione dinamica) così Tailwind li rileva in build.
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';

export interface ToneClasses {
  dot: string;
  text: string;
  bg: string;
  ring: string;
  iconBg: string;
  iconText: string;
}

export const TONES: Record<StatusTone, ToneClasses> = {
  success: {
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10',
    ring: 'ring-success/20',
    iconBg: 'bg-success/10',
    iconText: 'text-success',
  },
  warning: {
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10',
    ring: 'ring-warning/20',
    iconBg: 'bg-warning/10',
    iconText: 'text-warning',
  },
  danger: {
    dot: 'bg-destructive',
    text: 'text-destructive',
    bg: 'bg-destructive/10',
    ring: 'ring-destructive/20',
    iconBg: 'bg-destructive/10',
    iconText: 'text-destructive',
  },
  info: {
    dot: 'bg-info',
    text: 'text-info',
    bg: 'bg-info/10',
    ring: 'ring-info/20',
    iconBg: 'bg-info/10',
    iconText: 'text-info',
  },
  primary: {
    dot: 'bg-primary',
    text: 'text-primary',
    bg: 'bg-primary/10',
    ring: 'ring-primary/20',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
  },
  neutral: {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    ring: 'ring-border',
    iconBg: 'bg-muted',
    iconText: 'text-muted-foreground',
  },
};
