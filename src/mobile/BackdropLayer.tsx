import { useEffect, useState } from 'react';
import { usePro } from '@/lib/pro/store';
import { applyBackdrop, myPhotoUrl, PHOTOS, useBackdrop, type Backdrop } from './backdrop';

/**
 * The chosen background, behind everything: fixed to the screen while the
 * list scrolls over it, under a veil of the page's own colour so the words
 * stay as easy to read as on plain paper.
 */
export function BackdropLayer() {
  const picked = useBackdrop();
  // Backgrounds are Pro: if Pro ends, the choice is kept but not shown.
  const chosen: Backdrop = usePro() ? picked : { kind: 'none' };
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    applyBackdrop(chosen);
    return () => document.documentElement.removeAttribute('data-backdrop');
  }, [chosen]);

  const version = chosen.kind === 'mine' ? chosen.version : 0;
  useEffect(() => {
    if (chosen.kind !== 'mine') return;
    let live = true;
    void myPhotoUrl().then((url) => live && setMine(url ? `${url}?v=${version}` : null));
    return () => {
      live = false;
    };
  }, [chosen.kind, version]);

  if (chosen.kind === 'none') return null;
  const src = chosen.kind === 'photo' ? PHOTOS.find((p) => p.id === chosen.id)?.src : chosen.kind === 'mine' ? mine : null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {chosen.kind === 'art' ? (
        <div className={`backdrop-art backdrop-art-${chosen.id} absolute inset-0`} />
      ) : src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <div className={chosen.kind === 'art' ? 'backdrop-veil-art absolute inset-0' : 'backdrop-veil-photo absolute inset-0'} />
    </div>
  );
}
