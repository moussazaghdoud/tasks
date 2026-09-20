import { describe, expect, it } from 'vitest';
import { normalizeBase } from './platform';

describe('normalizeBase', () => {
  it('assumes https when the scheme is missing', () => {
    expect(normalizeBase('tasks-production-2a6e.up.railway.app')).toBe('https://tasks-production-2a6e.up.railway.app');
  });

  it('leaves a full URL alone', () => {
    expect(normalizeBase('https://example.com')).toBe('https://example.com');
    expect(normalizeBase('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('drops trailing slashes, which would double up in the request path', () => {
    expect(normalizeBase('https://example.com/')).toBe('https://example.com');
    expect(normalizeBase('example.com//')).toBe('https://example.com');
  });

  it('tolerates whitespace from a copy and paste', () => {
    expect(normalizeBase('  https://example.com  ')).toBe('https://example.com');
  });

  it('treats nothing as not configured', () => {
    expect(normalizeBase(undefined)).toBe('');
    expect(normalizeBase('   ')).toBe('');
  });
});
