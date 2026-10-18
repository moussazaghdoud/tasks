import { CapacitorHttp } from '@capacitor/core';
import { isNative } from '@/lib/native/platform';

/**
 * Where a definition comes from: the opening of the Wikipedia article on
 * the term — reliable, sourced, free, and no AI involved.
 *
 * Asked in the language the person reads, then in English, which has the
 * most technical articles. A disambiguation page is skipped for the next
 * match. Only the term is sent, to Wikipedia (the Wikimedia Foundation);
 * nothing about the person.
 */

export interface Found {
  term: string;
  title: string;
  extract: string;
  url: string;
  lang: string;
}

/** Wikimedia asks apps to say who they are. */
const AGENT = 'Hence/1.1 (iHenceteam@gmail.com)';

async function getJson<T>(url: string): Promise<T | null> {
  try {
    if (isNative()) {
      const res = await CapacitorHttp.get({ url, headers: { 'Api-User-Agent': AGENT, Accept: 'application/json' } });
      return res.status >= 200 && res.status < 300 ? (res.data as T) : null;
    }
    const res = await fetch(url, { headers: { 'Api-User-Agent': AGENT, Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface SearchResult {
  pages?: Array<{ key: string; title: string }>;
}

interface Summary {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } };
}

const plain = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Whether an article is about the term, not merely near it: a title search
 * for "VXLAN" also offers "Valentino Rossi". The title has to contain the
 * term (or the term the title), or the article's opening has to name it —
 * otherwise nothing is found, rather than something wrong.
 */
export function isAbout(term: string, title: string, extract: string): boolean {
  const t = plain(term);
  const ti = plain(title);
  if (!t) return false;
  return ti.includes(t) || (ti.length > 2 && t.includes(ti)) || plain(extract).includes(t);
}

async function inLanguage(term: string, lang: string): Promise<Found | null> {
  const base = `https://${lang}.wikipedia.org`;
  const search = await getJson<SearchResult>(`${base}/w/rest.php/v1/search/title?q=${encodeURIComponent(term)}&limit=3`);
  for (const page of search?.pages ?? []) {
    const summary = await getJson<Summary>(`${base}/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
    if (!summary?.extract || summary.type === 'disambiguation') continue;
    if (!isAbout(term, summary.title ?? page.title, summary.extract)) continue;
    return {
      term,
      title: summary.title ?? page.title,
      extract: summary.extract.trim(),
      url: summary.content_urls?.mobile?.page ?? summary.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(page.key)}`,
      lang,
    };
  }
  return null;
}

/** The article that best answers this term, in the first language that has one. */
export async function lookUp(term: string, langs: string[]): Promise<Found | null> {
  for (const lang of [...new Set([...langs, 'en'])]) {
    const found = await inLanguage(term, lang);
    if (found) return found;
  }
  return null;
}
