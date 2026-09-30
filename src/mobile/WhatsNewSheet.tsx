import { useEffect, useState } from 'react';
import { t } from './i18n';
import { Sheet } from './Sheet';
import { markSeen, pendingAnnouncement, type Announcement } from './whatsNew';

/**
 * "Welcome" at the first launch, "What's new" at the first launch after an
 * update. Once each, a single Continue, and never in the way of capturing:
 * the microphone is one swipe down.
 */
export function WhatsNewSheet() {
  const [shown, setShown] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    // A beat after launch, so the list is on screen underneath first.
    const id = setTimeout(() => {
      void pendingAnnouncement().then((found) => {
        if (!live || !found) return;
        setShown(found);
        setOpen(true);
      });
    }, 700);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, []);

  if (!shown) return null;

  const close = () => {
    markSeen(shown.version);
    setOpen(false);
  };

  return (
    <Sheet open={open} onClose={close} label={t(shown.kind === 'welcome' ? 'wn_title_welcome' : 'wn_title_update')}>
      <div className="px-6 pb-2">
        <h2 className="text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-ink">
          {t(shown.kind === 'welcome' ? 'wn_title_welcome' : 'wn_title_update')}
        </h2>
        {shown.kind === 'update' && <p className="mt-1 text-[13px] text-ink-4">{t('wn_version', { version: shown.version })}</p>}

        <ul className="mt-6 space-y-5">
          {shown.notes.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-accent/12 text-accent">
                <Icon className="size-[20px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[16px] leading-[22px] font-semibold text-ink">{t(title)}</span>
                <span className="mt-0.5 block text-[14px] leading-[20px] text-ink-3">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          onClick={close}
          className="mt-8 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-on-accent transition-transform active:scale-[0.985]"
        >
          {t('wn_continue')}
        </button>
      </div>
    </Sheet>
  );
}
