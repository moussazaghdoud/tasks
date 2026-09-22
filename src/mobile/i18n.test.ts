import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGES, localeOf, setLang, t } from './i18n';

describe('language', () => {
  beforeEach(() => setLang('en'));

  it('gives the interface its locale', () => {
    expect(localeOf()).toBe('en-US');
    setLang('fr');
    expect(localeOf()).toBe('fr-FR');
  });

  it('translates captions', () => {
    expect(t('business')).toBe('Business');
    setLang('fr');
    // Shortened when the agenda became a third tab: three labels have to
    // fit across a phone.
    expect(t('business')).toBe('Pro');
  });

  it('speaks Simplified Chinese, captions and microphone alike', () => {
    setLang('zh');
    expect(localeOf()).toBe('zh-CN');
    expect(t('business')).toBe('工作');
    expect(t('thoughts_many', { n: 3 })).toBe('3 条想法');
  });

  it('fills placeholders', () => {
    expect(t('thoughts_many', { n: 7 })).toBe('7 thoughts');
    setLang('fr');
    expect(t('thoughts_many', { n: 7 })).toBe('7 pensées');
  });

  it('leaves an unknown placeholder visible rather than printing "undefined"', () => {
    expect(t('moved_to', {})).toBe('Moved to {space}');
  });

  it('offers a locale for every language', () => {
    for (const l of LANGUAGES) expect(l.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });
});

describe('spoken language', () => {
  // Fresh module each time: the spoken choice is module state, and a choice
  // left over from one test would decide the next.
  async function fresh() {
    try {
      localStorage.clear();
    } catch {
      /* no storage in this environment */
    }
    vi.resetModules();
    const i18n = await import('./i18n');
    i18n.setLang('en');
    return i18n;
  }

  it('follows the interface until someone picks one', async () => {
    const i18n = await fresh();
    expect(i18n.speechLocale()).toBe('en-US');
    i18n.setLang('fr');
    expect(i18n.speechLocale()).toBe('fr-FR');
  });

  it('once picked, changes without moving the interface', async () => {
    const i18n = await fresh();
    i18n.setSpeechLang('zh');
    expect(i18n.speechLocale()).toBe('zh-CN');
    expect(i18n.t('business')).toBe('Business');
  });

  it('stays put when the interface language changes', async () => {
    const i18n = await fresh();
    i18n.setSpeechLang('en');
    i18n.setLang('fr');
    expect(i18n.speechLocale()).toBe('en-US');
  });

  it('cycles through every language and back to the first', async () => {
    const i18n = await fresh();
    const seen: string[] = [];
    for (let i = 0; i < i18n.LANGUAGES.length; i++) {
      const next = i18n.nextSpeechLang();
      i18n.setSpeechLang(next);
      seen.push(next);
    }
    expect(seen).toEqual(['fr', 'zh', 'en']);
  });
});
