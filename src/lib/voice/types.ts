/** Shared between the browser and the server route (server/voice.ts). */

export interface VoiceTaskDraft {
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: 'important' | 'normal' | 'low';
  /** Project name — matched to an existing project, or created on confirm. */
  project: string | null;
  /** Person name — matched to a known person, or added on confirm. */
  assignee: string | null;
  subtasks: string[];
  recurrence: { freq: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'; interval: number } | null;
  estimatedMinutes: number | null;
  /** Title of an existing task this memo is about, so it can become a step there instead. */
  relatedTo: string | null;
}

export interface VoiceContext {
  transcript: string;
  /** Local calendar date, YYYY-MM-DD. */
  today: string;
  /** Local wall-clock time, HH:mm. */
  now: string;
  weekday: string;
  timeZone: string;
  language: string;
  projects: Array<{ name: string; description?: string }>;
  people: string[];
  /** What's already on the list, so the memo can be read in context. */
  openTasks: Array<{ title: string; project?: string; due?: string }>;
}

export type VoiceApiResponse =
  | { ok: true; tasks: VoiceTaskDraft[]; source: 'claude'; ms: number }
  | { ok: false; error: 'not_configured' | 'refused' | 'rate_limited' | 'bad_request' | 'upstream'; message: string };
