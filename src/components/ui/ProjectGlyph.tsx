import {
  BookOpen,
  Briefcase,
  ChartNoAxesColumn,
  Circle,
  Crosshair,
  Globe,
  Heart,
  Home,
  Layers,
  Plane,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Accent, Project, ProjectIcon } from '@/domain/types';
import { cn } from '@/lib/platform';

export const ACCENTS: Accent[] = ['petrol', 'indigo', 'ember', 'olive', 'plum', 'ochre', 'slate', 'rose'];

export const ACCENT_HEX: Record<Accent, string> = {
  petrol: 'var(--color-p-petrol)',
  indigo: 'var(--color-p-indigo)',
  ember: 'var(--color-p-ember)',
  olive: 'var(--color-p-olive)',
  plum: 'var(--color-p-plum)',
  ochre: 'var(--color-p-ochre)',
  slate: 'var(--color-p-slate)',
  rose: 'var(--color-p-rose)',
};

export const PROJECT_ICONS: Record<ProjectIcon, LucideIcon> = {
  circle: Circle,
  briefcase: Briefcase,
  chart: ChartNoAxesColumn,
  layers: Layers,
  users: Users,
  home: Home,
  rocket: Rocket,
  globe: Globe,
  book: BookOpen,
  heart: Heart,
  plane: Plane,
  target: Crosshair,
};

/** Small tinted mark for a project. "circle" renders a solid dot. */
export function ProjectGlyph({ project, size = 14, className }: { project: Pick<Project, 'icon' | 'accent'>; size?: number; className?: string }) {
  const color = ACCENT_HEX[project.accent];
  if (project.icon === 'circle') {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
        <span className="rounded-[3px]" style={{ width: size * 0.55, height: size * 0.55, background: color }} />
      </span>
    );
  }
  const Icon = PROJECT_ICONS[project.icon];
  return <Icon className={cn('shrink-0', className)} style={{ color, width: size, height: size }} strokeWidth={2} />;
}
