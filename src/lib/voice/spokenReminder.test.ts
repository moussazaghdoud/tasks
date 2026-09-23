import { describe, expect, it } from 'vitest';
import { extractReminder } from './spokenReminder';

/** Wednesday 23 September 2026, 10:00 in the local zone. */
const NOW = new Date(2026, 8, 23, 10, 0, 0, 0);

const when = (said: string) => extractReminder(said, NOW).at;
const left = (said: string) => extractReminder(said, NOW).text;
const stamp = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;

describe('extractReminder', () => {
  it('hears a day and an hour, and takes the asking out of the thought', () => {
    const { at, text } = extractReminder('Remind me tomorrow at 9am to call the dentist', NOW);
    expect(stamp(at)).toBe('2026-09-24 09:00');
    expect(text).toBe('Call the dentist');
  });

  it('reads the hour the way it was said', () => {
    expect(stamp(when('Remind me tomorrow at 2pm'))).toBe('2026-09-24 14:00');
    expect(stamp(when('Remind me tomorrow at 14:30'))).toBe('2026-09-24 14:30');
    expect(stamp(when('Remind me tomorrow at 9:30 pm'))).toBe('2026-09-24 21:30');
    // Bare and small means the afternoon; nobody means five in the morning
    // without saying so.
    expect(stamp(when('Remind me tomorrow at 5'))).toBe('2026-09-24 17:00');
    expect(stamp(when('Remind me tomorrow at 5 am'))).toBe('2026-09-24 05:00');
  });

  it('puts an hour that has already gone by on the next day', () => {
    expect(stamp(when('Remind me at 8am to send the invoice'))).toBe('2026-09-24 08:00');
    expect(stamp(when('Remind me at 4pm to send the invoice'))).toBe('2026-09-23 16:00');
  });

  it('understands a delay', () => {
    expect(stamp(when('Remind me in 20 minutes'))).toBe('2026-09-23 10:20');
    expect(stamp(when('Remind me in 2 hours to check the oven'))).toBe('2026-09-23 12:00');
    expect(left('Remind me in 2 hours to check the oven')).toBe('Check the oven');
  });

  it('finds the next weekday, and next week when today is that day', () => {
    expect(stamp(when('Remind me friday at 11am about the report'))).toBe('2026-09-25 11:00');
    // Wednesday 10am asking for Wednesday 9am: that hour is gone, so next week.
    expect(stamp(when('Remind me wednesday at 9am'))).toBe('2026-09-30 09:00');
    expect(stamp(when('Remind me wednesday at 3pm'))).toBe('2026-09-23 15:00');
  });

  it('takes tonight, this afternoon and a plain tomorrow at their word', () => {
    expect(stamp(when('Remind me tonight to water the plants'))).toBe('2026-09-23 19:00');
    expect(stamp(when('Remind me this afternoon'))).toBe('2026-09-23 14:00');
    expect(stamp(when('Remind me tomorrow to book the train'))).toBe('2026-09-24 09:00');
  });

  it('keeps the hour when the asking comes last', () => {
    const { at, text } = extractReminder('Call Paul tomorrow at 9am, remind me', NOW);
    expect(stamp(at)).toBe('2026-09-24 09:00');
    // The sentence already reads well; only the request is dropped.
    expect(text).toBe('Call Paul tomorrow at 9am');
  });

  it('speaks French', () => {
    expect(stamp(when('Rappelle-moi demain à 9h d’appeler le dentiste'))).toBe('2026-09-24 09:00');
    expect(stamp(when('Rappelle moi ce soir'))).toBe('2026-09-23 19:00');
    expect(stamp(when('Rappelle-moi dans 30 minutes'))).toBe('2026-09-23 10:30');
    expect(stamp(when('Rappelle-moi vendredi à 15h30'))).toBe('2026-09-25 15:30');
    expect(left('Rappelle-moi demain à 9h d’appeler le dentiste')).toBe('D’appeler le dentiste');
  });

  it('speaks Chinese', () => {
    expect(stamp(when('提醒我明天早上9点给牙医打电话'))).toBe('2026-09-24 09:00');
    expect(stamp(when('提醒我明天下午3点'))).toBe('2026-09-24 15:00');
    expect(stamp(when('提醒我30分钟后检查烤箱'))).toBe('2026-09-23 10:30');
  });

  it('leaves a thought that asked for nothing exactly as it was', () => {
    for (const said of [
      'Buy milk on the way home',
      'Remind Paul about the five o’clock meeting',
      'I should remind myself to breathe',
    ]) {
      expect(extractReminder(said, NOW)).toEqual({ at: null, text: said });
    }
  });

  it('will not invent an hour it was not given', () => {
    // A request with no time in it: the words stay, nothing is scheduled.
    expect(extractReminder('Remind me about this', NOW)).toEqual({ at: null, text: 'Remind me about this' });
    // A bare number is not a time.
    expect(when('Remind me 5 people are coming')).toBeNull();
  });

  it('never schedules a reminder in the past', () => {
    const at = when('Remind me today at 6am');
    expect(at === null || at.getTime() > NOW.getTime()).toBe(true);
  });

  it('gives back nothing for an empty memo', () => {
    expect(extractReminder('   ', NOW)).toEqual({ at: null, text: '' });
  });
});
