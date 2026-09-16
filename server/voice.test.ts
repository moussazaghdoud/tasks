import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { analyzeTranscript, VoiceAnalysisError } from './voice.ts';
import type { VoiceContext } from '../src/lib/voice/types.ts';

const ctx: VoiceContext = {
  transcript: 'call thierry tomorrow about the partner terms its urgent and ask claire to send the deck by friday',
  today: '2026-09-15',
  now: '09:40',
  weekday: 'Tuesday',
  timeZone: 'Europe/Paris',
  language: 'en-US',
  projects: [{ name: 'IPS', description: 'Q4 business' }],
  people: ['Thierry Dubois', 'Claire Laurent'],
  openTasks: [{ title: 'Prepare board presentation', project: 'IPS', due: 'Friday' }],
};

/** A client whose HTTP layer is a stub: records the request, returns `reply`. */
function stubClient(reply: { status?: number; body: unknown }) {
  const seen: { url?: string; headers?: Headers; body?: Record<string, unknown> } = {};
  const client = new Anthropic({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.headers = new Headers(init?.headers);
      seen.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, seen };
}

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('analyzeTranscript', () => {
  it('sends a structured-output request to Claude Opus 5 with refusal fallbacks', async () => {
    const { client, seen } = stubClient({ body: message(JSON.stringify({ tasks: [] })) });
    await analyzeTranscript(ctx, client);
    expect(seen.url).toContain('/v1/messages');
    expect(seen.headers?.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(seen.body?.model).toBe('claude-opus-5');
    expect(seen.body?.fallbacks).toBe('default');
    const output = seen.body?.output_config as { effort: string; format: { type: string } };
    expect(output.effort).toBe('low');
    expect(output.format.type).toBe('json_schema');
    const user = (seen.body?.messages as Array<{ content: string }>)[0].content;
    expect(user).toContain('Tuesday 2026-09-15');
    expect(user).toContain('<voice_memo>');
    expect(user).toContain('Claire Laurent');
    // The memo is read against what's already on the list.
    expect(user).toContain('Open tasks already on the list');
    expect(user).toContain('Prepare board presentation [IPS] (due Friday)');
  });

  it('returns sanitized drafts', async () => {
    const tasks = [
      {
        title: 'call Thierry about the partner terms',
        notes: '',
        dueDate: '2026-09-16',
        dueTime: '25:00', // invalid → dropped
        priority: 'important',
        project: 'IPS',
        assignee: null,
        subtasks: [' ', 'Check last proposal'],
        recurrence: null,
        estimatedMinutes: null,
        relatedTo: ' Prepare board presentation ',
      },
      { title: '  ', notes: '', dueDate: null, dueTime: null, priority: 'normal', project: null, assignee: null, subtasks: [], recurrence: null, estimatedMinutes: null, relatedTo: null },
    ];
    const { client } = stubClient({ body: message(JSON.stringify({ tasks })) });
    const drafts = await analyzeTranscript(ctx, client);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('Call Thierry about the partner terms');
    expect(drafts[0].dueTime).toBeNull();
    expect(drafts[0].subtasks).toEqual(['Check last proposal']);
    expect(drafts[0].relatedTo).toBe('Prepare board presentation');
  });

  it('reports a refusal instead of reading content', async () => {
    const { client } = stubClient({ body: message('', 'refusal') });
    await expect(analyzeTranscript(ctx, client)).rejects.toMatchObject({ code: 'refused' });
  });

  it('maps an authentication failure to not_configured', async () => {
    const { client } = stubClient({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    const error = await analyzeTranscript(ctx, client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceAnalysisError);
    expect((error as VoiceAnalysisError).code).toBe('not_configured');
  });
});
