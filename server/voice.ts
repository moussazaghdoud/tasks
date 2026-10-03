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

// Tidying one spoken note is a small job: Sonnet does it about as well as
// Opus for well under half the cost per note.
const MODEL = 'claude-sonnet-5';
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

/* ---- Gemini, the alternative ---- */

/**
 * Which service tidies notes: VOICE_PROVIDER on the server, `claude` unless
 * set to `gemini`. One switch for everyone — the app asks /healthz which is
 * active so it can name it before anything is sent.
 */
export type Provider = 'claude' | 'gemini';
export const activeProvider = (): Provider => (process.env.VOICE_PROVIDER?.trim().toLowerCase() === 'gemini' ? 'gemini' : 'claude');

/** Google's fast, low-cost model by default; GEMINI_MODEL overrides it. */
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';

/**
 * The same answer shape as TASKS_SCHEMA, in the schema dialect Gemini's
 * generateContent takes: `nullable` instead of a null branch, and no
 * `additionalProperties`.
 */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['title', 'notes', 'dueDate', 'dueTime', 'priority', 'project', 'assignee', 'subtasks', 'recurrence', 'estimatedMinutes', 'relatedTo'],
        properties: {
          title: { type: 'STRING', description: 'Short imperative task title, starting with a verb.' },
          notes: { type: 'STRING', description: 'A tight summary of the context worth keeping; empty string if none.' },
          dueDate: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' },
          dueTime: { type: 'STRING', nullable: true, description: 'HH:mm, 24-hour' },
          priority: { type: 'STRING', enum: ['important', 'normal', 'low'] },
          project: { type: 'STRING', nullable: true },
          assignee: { type: 'STRING', nullable: true },
          subtasks: { type: 'ARRAY', items: { type: 'STRING' } },
          recurrence: {
            type: 'OBJECT',
            nullable: true,
            required: ['freq', 'interval'],
            properties: {
              freq: { type: 'STRING', enum: ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] },
              interval: { type: 'INTEGER' },
            },
          },
          estimatedMinutes: { type: 'INTEGER', nullable: true },
          relatedTo: { type: 'STRING', nullable: true, description: 'Exact title of an existing open task this memo is about.' },
        },
      },
    },
  },
} as const;

/** Fill what a looser schema may leave out, so sanitize() sees the full shape. */
function complete(raw: Partial<VoiceTaskDraft>): VoiceTaskDraft {
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    dueDate: raw.dueDate ?? null,
    dueTime: raw.dueTime ?? null,
    priority: raw.priority === 'important' || raw.priority === 'low' ? raw.priority : 'normal',
    project: raw.project ?? null,
    assignee: raw.assignee ?? null,
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.filter((s): s is string => typeof s === 'string') : [],
    recurrence: raw.recurrence ?? null,
    estimatedMinutes: typeof raw.estimatedMinutes === 'number' ? raw.estimatedMinutes : null,
    relatedTo: raw.relatedTo ?? null,
  };
}

/** The same instructions and context as Claude gets, asked of Gemini. */
export async function analyzeWithGemini(ctx: VoiceContext, fetchImpl: typeof fetch = fetch): Promise<VoiceTaskDraft[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new VoiceAnalysisError('not_configured', 'No Gemini API key.');
  const model = geminiModel();

  let response: Response;
  try {
    // The key travels in a header, not the URL, so no log ever holds it.
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt({ ...ctx, transcript: ctx.transcript.slice(0, MAX_TRANSCRIPT) }) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0.2, maxOutputTokens: 4000 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    throw new VoiceAnalysisError('upstream', error instanceof Error ? error.message : 'Gemini unreachable');
  }

  const body = (await response.json().catch(() => null)) as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    const message = body?.error?.message ?? `Gemini error ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new VoiceAnalysisError('not_configured', message);
    if (response.status === 429) throw new VoiceAnalysisError('rate_limited', message);
    if (response.status === 400) throw new VoiceAnalysisError('bad_request', message);
    throw new VoiceAnalysisError('upstream', message);
  }

  const usage = body?.usageMetadata;
  console.log(`[hence] voice tokens model=${model} in=${usage?.promptTokenCount ?? 0} out=${usage?.candidatesTokenCount ?? 0} cached=0`);

  const candidate = body?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new VoiceAnalysisError('refused', 'The request was declined.');
  }
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new VoiceAnalysisError('upstream', 'Empty response.');
  let parsed: { tasks?: Array<Partial<VoiceTaskDraft>> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VoiceAnalysisError('upstream', 'Gemini did not answer in the expected shape.');
  }
  return (parsed.tasks ?? []).map(complete).map(sanitize).filter((t): t is VoiceTaskDraft => t !== null).slice(0, 10);
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

  // Token counts only — never the memo — so the real cost per note can be read
  // from the logs without anything the privacy policy says is not kept.
  const { input_tokens, output_tokens, cache_read_input_tokens } = response.usage;
  console.log(`[hence] voice tokens model=${response.model} in=${input_tokens} out=${output_tokens} cached=${cache_read_input_tokens ?? 0}`);

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

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
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
    const analyze = activeProvider() === 'gemini' ? analyzeWithGemini : analyzeTranscript;
    const tasks = await analyze({
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
