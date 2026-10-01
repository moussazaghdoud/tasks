import { describe, expect, it } from 'vitest';
import { headlineOf } from './photos';

describe('headlineOf', () => {
  it('takes the first line that holds words', () => {
    expect(headlineOf('—\n  Jean Dupont\nDirecteur commercial\n06 12 34 56 78')).toBe('Jean Dupont');
  });

  it('keeps eight words at most', () => {
    expect(headlineOf('Q4 plan: hire two engineers, ship the beta, close the round')).toBe(
      'Q4 plan: hire two engineers, ship the beta,…',
    );
  });

  it('shortens a long line without spaces, as Chinese is written', () => {
    const line = '第四季度计划招聘两名工程师发布测试版并完成融资第四季度计划招聘两名工程师发布测试版并完成融资第四季度计划';
    const out = headlineOf(line);
    expect(out.length).toBe(48);
    expect(out.endsWith('…')).toBe(true);
  });

  it('gives nothing when nothing was read', () => {
    expect(headlineOf('')).toBe('');
    expect(headlineOf('— · —')).toBe('');
  });
});
