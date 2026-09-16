/**
 * Voice memo → tasks, server side.
 *
 * Runs inside the Vite dev/preview server (see vite.config.ts) so the Claude
 * credentials never reach the browser. The same `analyzeTranscript` function
 * can be dropped into a serverless route (Vercel, Netlify, Cloudflare) when
 * the app is deployed.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VoiceApiResponse, VoiceContext, VoiceTaskDraft } from '../src/lib/voice/types.ts';

const MODEL = 'claude-opus-5';
const MAX_TRANSCRIPT = 4000;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** Structured-output schema: Claude's reply is guaranteed to match it. */
const TASKS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'notes', 'dueDate', 'dueTime', 'priority', 'project', 'assignee', 'subtasks', 'recurrence', 'estimatedMinutes', 'relatedTo'],
        properties: {
          title: { type: 'string', description: 'Short imperative task title, starting with a verb.' },
          notes: { type: 'string', description: 'A tight summary of the context worth keeping; empty string if none.' },
          dueDate: nullable({ type: 'string', description: 'YYYY-MM-DD' }),
          dueTime: nullable({ type: 'string', description: 'HH:mm, 24-hour' }),
          priority: { type: 'string', enum: ['important', 'normal', 'low'] },
          project: nullable({ type: 'string' }),
          assignee: nullable({ type: 'string' }),
          subtasks: { type: 'array', items: { type: 'string' } },
          recurrence: nullable({
            type: 'object',
            additionalProperties: false,
            required: ['freq', 'interval'],
            properties: {
              freq: { type: 'string', enum: ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] },
              interval: { type: 'integer' },
            },
          }),
          estimatedMinutes: nullable({ type: 'integer' }),
          relatedTo: nullable({ type: 'string', description: 'Exact title of an existing open task this memo is about.' }),
        },
      },
    },
  },
} as const;

// Stable instructions first; everything that changes per request goes in the user turn.
const SYSTEM = `You turn a spoken voice memo into clear, actionable tasks for a personal task manager used by a busy professional.

The transcript comes from speech recognition, so expect missing punctuation, hesitations and occasional misheard words. Infer the intended meaning; fix obvious recognition errors, especially in names that match the known people and projects.

Think of it as taking a note for a colleague who has 10 seconds to read it: the action first, then only what they'd need to act well. A long, rambling memo should come back short and sharp, with nothing important lost.

How to write each task:
- One task per distinct action. Most memos are a single task. Split only when the speaker clearly lists separate things to do. Prefer one task with steps over several near-duplicate tasks.
- title: a short imperative sentence starting with a verb, at most about 70 characters, in the language the speaker used. Keep names, numbers and specifics. Drop filler, hesitation and framing such as "I need to", "remind me to", "don't forget", "euh", "il faut que".
- notes: a summary of what is worth keeping — the reason, the decision, constraints, numbers, names, what was ruled out. Write it in clean prose, at most two short sentences, not a transcript and never a repeat of the title. Empty string when the memo carried nothing beyond the action. Thinking out loud ("hmm, maybe, actually no") should end as the conclusion the speaker reached, not the deliberation.
- dueDate: resolve relative dates ("tomorrow", "next Friday", "end of the month", "demain", "vendredi prochain") against the current date given below. Null when no date or deadline was expressed — never invent one.
- dueTime: only when a time of day was said.
- priority: "important" only when the speaker signals urgency or importance (urgent, ASAP, critical, top priority, "before the board", "c'est urgent"). "low" when they say it's minor or can wait. Otherwise "normal".
- project: one of the existing project names when the memo clearly belongs to it, by name or by obvious topic. A new name only if the speaker explicitly names a project. Otherwise null.
- assignee: only when the speaker delegates the work to someone ("ask Claire to send the deck", "Thierry should review the contract"). Then the title is the work itself ("Send the deck") and the assignee is that person, using the known name when it matches. Someone the speaker must contact ("call Nicolas") is not the assignee. Otherwise null.
- subtasks: concrete steps the speaker enumerated. Do not invent steps.
- recurrence: only when the speaker says it repeats.
- estimatedMinutes: only when the speaker states how long it will take.
- relatedTo: the exact title of an existing open task when the memo is plainly about that task rather than a new one — the speaker refers to it ("the board deck", "that contract"), or this would otherwise duplicate it. The user is then offered to file it as a step there. Null when it stands on its own.

Read the memo against the lists below. Use the existing wording for people, projects and tasks the speaker is referring to, and fix names the recognizer garbled when a listed name is the obvious match.

If the memo contains nothing actionable, return an empty tasks list.`;

function userPrompt(ctx: VoiceContext): string {
  const projects = ctx.projects.length
    ? ctx.projects.map((p) => `- ${p.name}${p.description ? ` — ${p.description}` : ''}`).join('\n')
    : '(none)';
  const people = ctx.people.length ? ctx.people.join(', ') : '(none)';
  const open = ctx.openTasks?.length
    ? ctx.openTasks
        .map((t) => `- ${t.title}${t.project ? ` [${t.project}]` : ''}${t.due ? ` (due ${t.due})` : ''}`)
        .join('\n')
    : '(none)';
  return `Current date: ${ctx.weekday} ${ctx.today}, local time ${ctx.now} (${ctx.timeZone}).
Speech recognition language: ${ctx.language}.

Existing projects:
${projects}

Known people: ${people}

Open tasks already on the list:
${open}

<voice_memo>
${ctx.transcript}
</voice_memo>`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Defensive clean-up: the schema guarantees shape, not sensible values. */
function sanitize(raw: VoiceTaskDraft): VoiceTaskDraft | null {
  const title = raw.title.trim().replace(/\s+/g, ' ');
  if (!title) return null;
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    notes: raw.notes.trim(),
    dueDate: raw.dueDate && DATE_RE.test(raw.dueDate) ? raw.dueDate : null,
    dueTime: raw.dueDate && raw.dueTime && TIME_RE.test(raw.dueTime) ? raw.dueTime : null,
    priority: raw.priority,
    project: raw.project?.trim() || null,
    assignee: raw.assignee?.trim() || null,
    subtasks: raw.subtasks.map((s) => s.trim()).filter(Boolean).slice(0, 20),
    recurrence: raw.recurrence ? { freq: raw.recurrence.freq, interval: Math.max(1, Math.min(52, raw.recurrence.interval)) } : null,
    estimatedMinutes: raw.estimatedMinutes && raw.estimatedMinutes > 0 && raw.estimatedMinutes <= 24 * 60 ? raw.estimatedMinutes : null,
    relatedTo: raw.relatedTo?.trim() || null,
  };
}

export class VoiceAnalysisError extends Error {
  constructor(
    readonly code: 'not_configured' | 'refused' | 'rate_limited' | 'bad_request' | 'upstream',
    message: string,
  ) {
    super(message);
  }
}

let sharedClient: Anthropic | null = null;

export async function analyzeTranscript(ctx: VoiceContext, client: Anthropic = (sharedClient ??= new Anthropic())): Promise<VoiceTaskDraft[]> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // A quick extraction: low effort keeps latency to a few seconds.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TASKS_SCHEMA } },
      // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt({ ...ctx, transcript: ctx.transcript.slice(0, MAX_TRANSCRIPT) }) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new VoiceAnalysisError('not_configured', 'Claude credentials are missing or invalid.');
    }
    if (error instanceof Anthropic.RateLimitError) throw new VoiceAnalysisError('rate_limited', 'Rate limited by the Claude API.');
    if (error instanceof Anthropic.BadRequestError) throw new VoiceAnalysisError('bad_request', error.message);
    if (error instanceof Anthropic.APIError) throw new VoiceAnalysisError('upstream', `Claude API error ${error.status}`);
    // No credentials at all: the client can't even build a request.
    if (error instanceof Error && /api key|apiKey|authToken|credential/i.test(error.message)) {
      throw new VoiceAnalysisError('not_configured', 'No Claude credentials found.');
    }
    throw new VoiceAnalysisError('upstream', error instanceof Error ? error.message : 'Unknown error');
  }

  if (response.stop_reason === 'refusal') throw new VoiceAnalysisError('refused', 'The request was declined.');
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) throw new VoiceAnalysisError('upstream', 'Empty response.');
  const parsed = JSON.parse(text) as { tasks: VoiceTaskDraft[] };
  return parsed.tasks.map(sanitize).filter((t): t is VoiceTaskDraft => t !== null).slice(0, 10);
}

// ---- HTTP glue for Connect-style middleware (Vite dev & preview servers) ----

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > 64_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: VoiceApiResponse | { error: string }) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Analysis failures answer 200 with `ok: false` — they are expected states the
 * app handles (e.g. no key yet → on-device analysis), not transport errors.
 */
/**
 * The iOS app loads from capacitor://localhost, so its requests are
 * cross-origin. Allow the native origins (and any extra ones configured);
 * a browser on the same origin doesn't need this.
 */
const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost'];

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && [...NATIVE_ORIGINS, ...extra].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

export async function voiceMiddleware(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  let ctx: VoiceContext;
  try {
    ctx = JSON.parse(await readBody(req)) as VoiceContext;
    if (typeof ctx.transcript !== 'string' || !ctx.transcript.trim() || !DATE_RE.test(ctx.today)) throw new Error('invalid');
  } catch {
    return send(res, 400, { error: 'bad_request' });
  }
  try {
    const started = Date.now();
    const tasks = await analyzeTranscript({
      ...ctx,
      projects: Array.isArray(ctx.projects) ? ctx.projects.slice(0, 50) : [],
      people: Array.isArray(ctx.people) ? ctx.people.slice(0, 100) : [],
      openTasks: Array.isArray(ctx.openTasks) ? ctx.openTasks.slice(0, 60) : [],
    });
    send(res, 200, { ok: true, tasks, source: 'claude', ms: Date.now() - started });
  } catch (error) {
    const e = error instanceof VoiceAnalysisError ? error : new VoiceAnalysisError('upstream', String(error));
    if (e.code !== 'not_configured') console.warn(`[hence] voice analysis failed (${e.code}): ${e.message}`);
    send(res, 200, { ok: false, error: e.code, message: e.message });
  }
}
