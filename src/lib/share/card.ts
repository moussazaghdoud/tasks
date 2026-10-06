import { fromB64, toB64 } from './crypto';

/**
 * A contact card: what someone needs to send me a thought. My identifier,
 * my name and my public key — nothing secret.
 *
 * It travels as a link, `hence://add#1.<data>`, in the QR code and in the
 * "send my code" message alike. A QR read by the iPhone's own Camera opens
 * Hence on it directly. The data sits after the `#`, which a browser never
 * sends to a server. The `1.` is the format's version.
 */
export interface Card {
  id: string;
  name: string;
  publicKey: string;
}

export function cardLink(card: Card): string {
  const data = toB64(new TextEncoder().encode(JSON.stringify({ v: 1, id: card.id, name: card.name, pk: card.publicKey })));
  return `hence://add#1.${data}`;
}

/** The card in a link, a QR's text or a pasted message; null when there is none. */
export function readCard(text: string): Card | null {
  const match = /#1\.([A-Za-z0-9_-]{20,})/.exec(text);
  if (!match) return null;
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromB64(match[1]))) as { v?: number; id?: unknown; name?: unknown; pk?: unknown };
    if (raw.v !== 1 || typeof raw.id !== 'string' || typeof raw.pk !== 'string') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(raw.id) || !/^[A-Za-z0-9_-]{80,100}$/.test(raw.pk)) return null;
    return { id: raw.id, name, publicKey: raw.pk };
  } catch {
    return null;
  }
}
