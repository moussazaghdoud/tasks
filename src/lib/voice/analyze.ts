import { ME } from '@/domain/factories';
import { dueLabel, todayKey } from '@/lib/dates';
import { apiBase, isNative } from '@/lib/native/platform';
import { ws } from '@/store/workspace';
import { localAnalyze } from './localAnalyze';
import type { VoiceApiResponse, VoiceContext, VoiceTaskDraft } from './types';

export interface AnalysisResult {
  tasks: VoiceTaskDraft[];
  source: 'claude' | 'local';
  /** Shown quietly under the result when the fallback was used. */
  notice?: string;
}

function buildContext(transcript: string, language: string): VoiceContext {
  const s = ws();
  const now = new Date();
  return {
    transcript,
    today: todayKey(now),
    now: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language,
    projects: Object.values(s.projects)
      .filter((p) => !p.archivedAt)
      .map((p) => ({ name: p.name, description: p.description || undefined })),
    people: Object.values(s.people)
      .filter((p) => p.id !== ME)
      .map((p) => p.name),
    // What's already on the list, so a memo about existing work is recognized.
    openTasks: Object.values(s.tasks)
      .filter((t) => t.status !== 'done' && !t.archivedAt)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 60)
      .map((t) => ({
        title: t.title,
        project: t.projectId ? s.projects[t.projectId]?.name : undefined,
        due: t.dueDate ? dueLabel(t.dueDate) : undefined,
      })),
  };
}

function local(transcript: string, notice?: string): AnalysisResult {
  const s = ws();
  const tasks = localAnalyze(transcript, {
    projects: Object.values(s.projects).filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name })),
    people: Object.values(s.people).filter((p) => p.id !== ME).map((p) => ({ id: p.id, name: p.name })),
  });
  return { tasks, source: 'local', notice };
}

/** Once we know Claude isn't set up, skip the round trip for the rest of the session. */
let claudeUnavailable = false;

/**
 * Turn a memo into task drafts: Claude when configured (via the app's own
 * server route), otherwise on-device analysis. Never throws.
 */
export async function analyzeMemo(transcript: string, language: string): Promise<AnalysisResult> {
  const text = transcript.trim();
  if (!text) return { tasks: [], source: 'local' };
  if (claudeUnavailable) return local(text, 'On-device analysis. Add a Claude API key for smarter results.');
  if (isNative() && !apiBase()) {
    claudeUnavailable = true;
    return local(text, 'This build has no server configured, so analysis ran on your device.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return local(text, 'You’re offline, so this was analyzed on your device.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    // Web: same origin. Native app: the deployed server (VITE_API_BASE_URL).
    const res = await fetch(`${apiBase()}/api/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildContext(text, language)),
      signal: controller.signal,
    });
    if (!res.ok) return local(text, 'Claude was unavailable, so this was analyzed on your device.');
    const data = (await res.json()) as VoiceApiResponse;
    if (data.ok) return { tasks: data.tasks, source: 'claude' };
    if (data.error === 'not_configured') {
      claudeUnavailable = true;
      return local(text, 'On-device analysis. Add a Claude API key for smarter results.');
    }
    return local(text, 'Claude was unavailable, so this was analyzed on your device.');
  } catch {
    return local(text, 'Claude was unreachable, so this was analyzed on your device.');
  } finally {
    clearTimeout(timer);
  }
}
