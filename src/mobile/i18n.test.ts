import { beforeEach, describe, expect, it } from 'vitest';
import { LANGUAGES, localeOf, setLang, t } from './i18n';

describe('language', () => {
  beforeEach(() => setLang('en'));

  it('drives the speech locale, which is the whole point of the setting', () => {
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
