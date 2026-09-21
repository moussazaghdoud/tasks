import { useSyncExternalStore } from 'react';

/**
 * The app's language — one choice that drives both what you read and what the
 * recogniser listens for.
 *
 * Those were separate before, and the recogniser took its cue from the phone's
 * locale: speak English into a French phone and you get French words back,
 * which Claude then faithfully turns into a clean, wrong thought. A person
 * knows which language they are about to speak; the phone only knows how it
 * was set up.
 */
export type Lang = 'en' | 'fr';

export const LANGUAGES: Array<{ id: Lang; native: string; locale: string }> = [
  { id: 'en', native: 'English', locale: 'en-US' },
  { id: 'fr', native: 'Français', locale: 'fr-FR' },
];

const KEY = 'hence.lang';

function detect(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {
    /* private browsing */
  }
  return typeof navigator !== 'undefined' && /^fr/i.test(navigator.language) ? 'fr' : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export const currentLang = (): Lang => current;

/** BCP-47 tag, for `Intl` and for the speech recogniser. */
export const localeOf = (lang: Lang = current): string => LANGUAGES.find((l) => l.id === lang)!.locale;

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice simply will not outlive the session */
  }
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useLang = (): Lang => useSyncExternalStore(subscribe, () => current, () => 'en');

/* ------------------------------------------------------------------ */

const EN = {
  thoughts_one: '1 thought',
  thoughts_many: '{n} thoughts',
  nothing_kept: 'Nothing kept',
  search: 'Search',
  done_today: '{n} done today',
  clear_done: 'Clear',
  deleted_many: '{n} deleted',
  clear_confirm_title: 'Clear finished thoughts?',
  clear_confirm_body: 'This deletes {n}. You can undo it straight afterwards.',
  empty_title: 'What’s on your mind?',
  empty_hint: 'Tap the orb and speak.',
  empty_search: 'Nothing found.',
  agenda: 'Agenda',
  business: 'Business',
  agenda_today: 'Today’s meetings',
  agenda_empty: 'Nothing left today, and nothing tomorrow.',
  agenda_today_header: 'Today',
  agenda_tomorrow_header: 'Tomorrow',
  agenda_nothing_left: 'Nothing left today.',
  agenda_nothing_tomorrow: 'Nothing tomorrow.',
  agenda_now: 'Now',
  agenda_stale: 'Offline · as of {time} · tap to retry',
  agenda_loading: 'Reading your calendar…',
  agenda_failed: 'Could not reach your calendar.',
  agenda_connect: 'Connect Outlook in Settings to see today’s meetings here.',
  agenda_all_day: 'All day',
  retry: 'Try again',
  private: 'Private',

  listening: 'Listening',
  thinking: 'One moment',
  say_something: 'Say what’s on your mind…',
  done: 'Done',
  capture: 'Capture',
  type_placeholder: 'What’s on your mind?',
  cancel: 'Cancel',

  captured: 'Captured',
  captured_many: '{n} captured',
  captured_step: 'Added as a step',
  on_device_suffix: 'on-device',

  err_not_allowed: 'Allow the microphone in Settings to speak your thoughts.',
  err_plugin: 'Voice is missing from this build.',
  err_unsupported: 'Voice isn’t available on this device.',
  err_network: 'Transcription needs a connection.',
  err_no_speech: 'I didn’t catch that.',
  err_other: 'Something interrupted the recording.',

  captured_at: 'Captured {when}',
  tomorrow_at: 'Tomorrow {time}',
  act_done: 'Done',
  act_reopen: 'Not done after all',
  act_important: 'Important',
  act_not_important: 'Not important',
  act_remind: 'Remind me',
  act_change_remind: 'Change reminder',
  act_move_private: 'Move to Private',
  act_move_business: 'Move to Business',
  act_email: 'Turn into email',
  act_calendar: 'Add to calendar',
  act_share: 'Share',
  act_delete: 'Delete',

  remind_title: 'Remind me',
  remind_hour: 'In an hour',
  remind_evening: 'This evening',
  remind_tomorrow: 'Tomorrow morning',
  remind_next_week: 'Next week',
  remind_remove: 'Remove reminder',
  reminder_set: 'Reminder {when}',
  reminder_set_no_perm: 'Reminder set — allow notifications to be told',
  reminder_removed: 'Reminder removed',

  marked_important: 'Marked important',
  unmarked_important: 'No longer important',
  moved_to: 'Moved to {space}',
  deleted: 'Deleted',
  undo: 'Undo',
  copied: 'Copied',

  calendar: 'Calendar',
  connect_calendar: 'Connect Outlook',
  disconnect_calendar: 'Disconnect',
  calendar_note: 'Connected, thoughts become events in your own calendar. Otherwise they are handed to the share sheet.',
  connecting: 'Connecting…',
  connect_failed: 'Could not connect to Microsoft',
  connected_as: 'Connected',
  added_to_calendar: 'Added to your calendar',
  settings: 'Settings',
  appearance: 'Appearance',
  theme_dark: 'Dark',
  theme_light: 'Light',
  language: 'Language',
  language_note: 'Used for what you read, and for what the microphone listens for.',
} as const;

type Key = keyof typeof EN;

const FR: Record<Key, string> = {
  thoughts_one: '1 pensée',
  thoughts_many: '{n} pensées',
  nothing_kept: 'Rien de noté',
  search: 'Rechercher',
  done_today: '{n} terminées aujourd’hui',
  clear_done: 'Effacer',
  deleted_many: '{n} supprimées',
  clear_confirm_title: 'Effacer les pensées terminées ?',
  clear_confirm_body: 'Cela en supprime {n}. Vous pourrez annuler juste après.',
  empty_title: 'À quoi pensez-vous ?',
  empty_hint: 'Touchez le micro et parlez.',
  empty_search: 'Aucun résultat.',
  agenda: 'Agenda',
  business: 'Pro',
  agenda_today: 'Réunions du jour',
  agenda_empty: 'Plus rien aujourd’hui, et rien demain.',
  agenda_today_header: 'Aujourd’hui',
  agenda_tomorrow_header: 'Demain',
  agenda_nothing_left: 'Plus rien aujourd’hui.',
  agenda_nothing_tomorrow: 'Rien demain.',
  agenda_now: 'En cours',
  agenda_stale: 'Hors ligne · à jour à {time} · toucher pour réessayer',
  agenda_loading: 'Lecture de votre calendrier…',
  agenda_failed: 'Calendrier inaccessible.',
  agenda_connect: 'Connectez Outlook dans les Réglages pour voir vos réunions ici.',
  agenda_all_day: 'Journée',
  retry: 'Réessayer',
  private: 'Perso',

  listening: 'À l’écoute',
  thinking: 'Un instant',
  say_something: 'Dites ce que vous avez en tête…',
  done: 'Terminé',
  capture: 'Noter',
  type_placeholder: 'À quoi pensez-vous ?',
  cancel: 'Annuler',

  captured: 'Noté',
  captured_many: '{n} notées',
  captured_step: 'Ajouté comme étape',
  on_device_suffix: 'sur l’appareil',

  err_not_allowed: 'Autorisez le micro dans Réglages pour dicter vos pensées.',
  err_plugin: 'La dictée est absente de cette version.',
  err_unsupported: 'La dictée n’est pas disponible sur cet appareil.',
  err_network: 'La transcription nécessite une connexion.',
  err_no_speech: 'Je n’ai rien entendu.',
  err_other: 'L’enregistrement a été interrompu.',

  captured_at: 'Noté {when}',
  tomorrow_at: 'Demain {time}',
  act_done: 'Terminé',
  act_reopen: 'Finalement pas terminé',
  act_important: 'Important',
  act_not_important: 'Plus important',
  act_remind: 'Me le rappeler',
  act_change_remind: 'Modifier le rappel',
  act_move_private: 'Déplacer vers Personnel',
  act_move_business: 'Déplacer vers Professionnel',
  act_email: 'Transformer en e-mail',
  act_calendar: 'Ajouter au calendrier',
  act_share: 'Partager',
  act_delete: 'Supprimer',

  remind_title: 'Me le rappeler',
  remind_hour: 'Dans une heure',
  remind_evening: 'Ce soir',
  remind_tomorrow: 'Demain matin',
  remind_next_week: 'La semaine prochaine',
  remind_remove: 'Supprimer le rappel',
  reminder_set: 'Rappel {when}',
  reminder_set_no_perm: 'Rappel créé — autorisez les notifications pour être averti',
  reminder_removed: 'Rappel supprimé',

  marked_important: 'Marqué important',
  unmarked_important: 'Plus marqué important',
  moved_to: 'Déplacé vers {space}',
  deleted: 'Supprimé',
  undo: 'Annuler',
  copied: 'Copié',

  calendar: 'Calendrier',
  connect_calendar: 'Connecter Outlook',
  disconnect_calendar: 'Déconnecter',
  calendar_note: 'Une fois connecté, les pensées deviennent des événements dans votre calendrier. Sinon elles passent par la feuille de partage.',
  connecting: 'Connexion…',
  connect_failed: 'Connexion à Microsoft impossible',
  connected_as: 'Connecté',
  added_to_calendar: 'Ajouté à votre calendrier',
  settings: 'Réglages',
  appearance: 'Apparence',
  theme_dark: 'Sombre',
  theme_light: 'Clair',
  language: 'Langue',
  language_note: 'Sert à l’affichage et à ce que le micro écoute.',
};

const DICTIONARIES: Record<Lang, Record<Key, string>> = { en: EN, fr: FR };

/** Translate, filling {placeholders}. Typed, so a missing French line fails the build. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const line = DICTIONARIES[current][key];
  if (!vars) return line;
  return line.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function greetingIn(now = new Date()): string {
  const h = now.getHours();
  const slot = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const table = {
    en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
    fr: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },
  } as const;
  return table[current][slot];
}

/** "2 minutes ago" / "il y a 2 minutes", from the platform rather than a second dictionary. */
export function relativeIn(iso: string, now = new Date()): string {
  const fmt = new Intl.RelativeTimeFormat(localeOf(), { numeric: 'auto' });
  const mins = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (Math.abs(mins) < 60) return fmt.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return fmt.format(hours, 'hour');
  return fmt.format(Math.round(hours / 24), 'day');
}

export const timeIn = (d: Date): string => d.toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' });

export const dayTimeIn = (d: Date): string =>
  d.toLocaleString(localeOf(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
