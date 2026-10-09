import { useSyncExternalStore } from 'react';
import { AR } from './locales/ar';
import { DE } from './locales/de';
import { ES } from './locales/es';
import { IT } from './locales/it';

/**
 * Two languages: the one you read, and the one you speak.
 *
 * The recogniser has to be told which language is coming. Left to the phone's
 * locale, English spoken into a French phone comes back as French words, which
 * Claude then faithfully turns into a clean, wrong thought. A person knows
 * which language they are about to speak; the phone only knows how it was set
 * up.
 *
 * They are separate because they change at different speeds. The interface
 * language is set once. The spoken one changes from one thought to the next
 * for anyone who works in two languages, so it sits in the header, one tap
 * away, and the interface stays put.
 */
/**
 * Arabic is ready but not offered yet: its captions (locales/ar.ts), the
 * right-to-left layout and its spoken reminders are all in place. Offering
 * it is adding 'ar' here, its line to LANGUAGES and AR to DICTIONARIES.
 */
export type Lang = 'en' | 'fr' | 'it' | 'es' | 'de' | 'zh';

export const LANGUAGES: Array<{ id: Lang; native: string; short: string; locale: string }> = [
  { id: 'en', native: 'English', short: 'EN', locale: 'en-US' },
  { id: 'fr', native: 'Français', short: 'FR', locale: 'fr-FR' },
  { id: 'it', native: 'Italiano', short: 'IT', locale: 'it-IT' },
  { id: 'es', native: 'Español', short: 'ES', locale: 'es-ES' },
  { id: 'de', native: 'Deutsch', short: 'DE', locale: 'de-DE' },
  // Arabic, when it is offered: { id: 'ar', native: 'العربية', short: 'AR', locale: 'ar-SA' }.
  // Written right to left, the whole layout turns round for it (see applyDir).
  // Simplified, as used in mainland China. The recogniser takes zh-CN too,
  // and Claude writes the thought back in the language it heard.
  { id: 'zh', native: '简体中文', short: '中文', locale: 'zh-CN' },
];

/**
 * The spoken language is always one chosen language. Listening in several at
 * once and keeping the best transcript worked for three; for seven it is too
 * many recognisers at a time for a phone, so the person picks — once, in the
 * header — and the app remembers.
 */
export type SpokenChoice = Lang;

const KEY = 'hence.lang';
const SPEECH_KEY = 'hence.speech';

const isLang = (value: unknown): value is Lang => LANGUAGES.some((l) => l.id === value);
const isChoice = (value: unknown): value is SpokenChoice => isLang(value);

function stored(key: string): Lang | null {
  try {
    const value = localStorage.getItem(key);
    return isLang(value) ? value : null;
  } catch {
    /* private browsing */
    return null;
  }
}

function storedChoice(): SpokenChoice | null {
  try {
    const value = localStorage.getItem(SPEECH_KEY);
    return isChoice(value) ? value : null;
  } catch {
    return null;
  }
}

function detect(): Lang {
  const chosen = stored(KEY);
  if (chosen) return chosen;
  const phone = typeof navigator !== 'undefined' ? navigator.language : '';
  const match = LANGUAGES.find((l) => phone.toLowerCase().startsWith(l.id));
  return match ? match.id : 'en';
}

let current: Lang = detect();
/**
 * The interface's own language until someone picks another in the header.
 * A stored `auto` from before is read as nothing stored.
 */
let spoken: SpokenChoice | null = storedChoice();
const listeners = new Set<() => void>();

export const currentLang = (): Lang => current;
/** The language the microphone listens in: the one picked, else the interface's. */
export const speechLang = (): Lang => spoken ?? current;
export const spokenChoice = (): SpokenChoice => speechLang();

/** Languages read right to left — Arabic, once it is offered. */
const RIGHT_TO_LEFT: ReadonlySet<string> = new Set(['ar']);
export const isRtl = (lang: Lang = current): boolean => RIGHT_TO_LEFT.has(lang);

/**
 * Set the page's language and direction. `dir="rtl"` on <html> turns the
 * whole layout round — text, rows, the logical paddings and positions the
 * interface is written in — so Arabic reads as Arabic apps do.
 */
export function applyDir(lang: Lang = current): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = localeOf(lang);
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
}

/** BCP-47 tag, for `Intl` and for the speech recogniser. */
export const localeOf = (lang: Lang = current): string => LANGUAGES.find((l) => l.id === lang)!.locale;

/** What the microphone listens for. */
export const speechLocale = (): string => localeOf(speechLang());

/** The languages to listen in: the one chosen. A list, for the recogniser's sake. */
export function speechLocales(): string[] {
  return [localeOf(speechLang())];
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the choice simply will not outlive the session */
  }
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  remember(KEY, next);
  applyDir(next);
  for (const notify of listeners) notify();
}

export function setSpeechLang(next: SpokenChoice): void {
  if (next === spoken) return;
  spoken = next;
  remember(SPEECH_KEY, next);
  for (const notify of listeners) notify();
}


function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useLang = (): Lang => useSyncExternalStore(subscribe, () => current, () => 'en');
export const useSpeechLang = (): SpokenChoice => useSyncExternalStore(subscribe, spokenChoice, () => 'en');

/* ------------------------------------------------------------------ */

const EN = {
  thoughts_one: '1 thought',
  thoughts_many: '{n} thoughts',
  backup_section: 'Backup',
  backup_save: 'Back up my thoughts',
  backup_restore: 'Restore from a backup',
  backup_note: 'With iCloud on, a copy of your thoughts is kept in your own iCloud and brought back if you reinstall the app or change iPhone — we never see it. A backup file is a second copy, photos included, that you keep yourself. Restoring adds what is missing and never erases anything.',
  icloud_saved: 'Saved in your iCloud at {time}',
  icloud_saving: 'Saving to your iCloud…',
  icloud_off: 'iCloud is off for this iPhone — keep a backup file',
  icloud_error: 'Could not reach iCloud — it will try again',
  icloud_restoring: 'Bringing your thoughts back from iCloud…',
  icloud_restored: '{n} thoughts brought back from iCloud',
  backup_failed: 'The backup could not be made.',
  restore_not_backup: 'This file is not a Hence backup.',
  restore_nothing: 'Everything in this backup is already here.',
  restore_done: '{n} thoughts brought back',
  nothing_kept: 'Nothing kept',
  meetings_one: '1 meeting',
  meetings_many: '{n} meetings',
  meetings_none: 'Nothing left',
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
  agenda_empty: 'Nothing left this week.',
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
  take_photo: 'Take a photo',
  photo_attached: 'Photo',
  photo_thought: 'Photo',
  photo_text: 'Text in the photo',
  photo_reading: 'Reading the text in the photo…',
  photo_read: 'Text read — you can search for it',
  wn_title_welcome: 'Welcome to Hence',
  wn_title_update: 'What’s new',
  wn_version: 'Version {version}',
  wn_continue: 'Continue',
  wn_speak_title: 'Tap the orb and speak',
  wn_speak_body: 'What you say becomes one clear line. Say “remind me tomorrow at nine” and the reminder is set.',
  wn_act_title: 'Tap a thought to act on it',
  wn_act_body: 'Done, reminder, email, calendar, share. Swipe right to finish it, left to delete it.',
  wn_private_title: 'It stays on your iPhone',
  wn_private_body: 'No account, no ads, no tracking. Your notes are read on your iPhone and stay there — nothing goes to an AI service.',
  wn_photo_text_title: 'Photos you can search',
  wn_photo_text_body: 'Hence reads the words in your photos — a whiteboard, a business card — on your iPhone. Search for them to find the photo.',
  wn_newline_title: 'Say “new line”',
  wn_newline_body: 'Dictating a list? Say “new line” and the next words go on a line of their own.',
  wn_reminders_title: 'Reminders, said your way',
  wn_reminders_body: '“At nine thirty”, “at noon”, “in half an hour” — in every language Hence speaks.',
  wn_swipe_title: 'Swipe to delete, right away',
  wn_swipe_body: 'A thought you have just captured can be swiped away at once.',
  wn_look_title: 'Pick a style',
  wn_look_body: 'Settings › Style: Pinboard, Notebook, Bubbles, Night sky, Pebbles, Orbit and more — each in dark and light.',
  wn_lang_title: 'Six languages',
  wn_lang_body: 'Hence now speaks and understands Italian, Spanish and German too. Pick the language you speak at the top of the main screen.',
  wn_voice_title: 'Watch your words light up',
  wn_voice_body: 'While you speak, colour breathes with your voice, and what Hence understands — a reminder, a name, a new line — lights up as you say it.',
  wn_backdrop_title: 'A background of your own',
  wn_backdrop_body: 'Settings › Background: soft art made by Hence, or one of your own photos — it stays on your iPhone.',
  meeting_yours: 'You organise this meeting',
  meeting_organized_by: 'Organised by {name}',
  meeting_cancel: 'Cancel the meeting',
  meeting_cancel_confirm: '“{subject}” will be cancelled and every attendee told.',
  meeting_cancelled: 'Meeting cancelled — attendees told',
  meeting_decline: 'Decline',
  meeting_decline_confirm: 'The organiser of “{subject}” will be told you are not coming, with: “Sorry, I can’t attend this meeting.”',
  meeting_decline_message: 'Sorry, I can’t attend this meeting.',
  meeting_declined: 'Declined — the organiser is told',
  meeting_write: 'Email the organiser',
  meeting_mail_subject: 'About:',
  meeting_failed: 'The calendar did not accept it.',
  meeting_refresh: 'Pull down on the agenda to refresh it, then try again.',
  wn_meeting_title: 'Answer a meeting from the agenda',
  wn_meeting_body: 'Tap a meeting to cancel it if it is yours, decline it if not, or email the organiser.',
  type_placeholder: 'What’s on your mind?',
  cancel: 'Cancel',
  save: 'Save',
  captured_reminded: 'Kept · reminder {when}',
  act_edit: 'Edit',
  edit_saved: 'Saved',
  edit_note_placeholder: 'Note (optional)',
  done_sheet: 'Done',

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
  perm_mic_title: 'Hence can’t hear you',
  perm_mic_body: 'The microphone or speech recognition is turned off for Hence. Turn them on in the iPhone’s Settings to speak your thoughts.',
  perm_camera_title: 'Hence can’t use the camera',
  perm_camera_body: 'The camera is turned off for Hence. Turn it on in the iPhone’s Settings to photograph a thought.',
  perm_open_settings: 'Open Settings',

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
  remind_pick: 'Pick a date and time',
  remind_pick_confirm: 'Set reminder',
  remind_pick_past: 'That moment has already passed.',
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
  connect_calendar: 'Not connected — tap to connect',
  calendar_email_placeholder: 'Your Microsoft email',
  calendar_continue: 'Continue',
  disconnect_calendar: 'Disconnect',
  calendar_note: 'Connected, thoughts become events in your own calendar, and your week appears in the Agenda. Connect both and the two are shown together.',
  connecting: 'Connecting…',
  connect_failed: 'Could not connect to Microsoft',
  connected_as: 'Connected',
  added_to_calendar: 'Added to your calendar',
  settings: 'Settings',
  appearance: 'Appearance',
  theme_dark: 'Dark',
  theme_light: 'Light',
  look_section: 'Style',
  look_classic: 'Classic',
  look_pinboard: 'Pinboard',
  look_notebook: 'Notebook',
  look_bubbles: 'Bubbles',
  look_sky: 'Night sky',
  look_pebbles: 'Pebbles',
  look_onething: 'One thing',
  look_nowlater: 'Now / Later',
  look_moodboard: 'Moodboard',
  look_orbit: 'Orbit',
  backdrop_section: 'Background',
  backdrop_none: 'None',
  backdrop_mine: 'My photo',
  zone_now: 'Now',
  zone_later: 'Later',
  language: 'Interface language',
  language_note: 'What you read. The language you speak is picked at the top of the main screen, next to search.',
  speech_lang: 'Speaking {lang}',
  speech_auto: 'any language',
  voice_diagnostics: 'Last recording',
  voice_diagnostics_note: 'What each language made of it, with how well it reads and how sure the recogniser was. The tick won.',
  speech_auto_short: 'AUTO',
  speech_auto_now: 'Listening in any language',
  speech_lang_now: 'Listening in {lang}',
  about: 'About',
  privacy_policy: 'Privacy policy',
  support: 'Support',

  // Spoken by VoiceOver, never shown.
  repeat_daily: 'Every day',
  repeat_weekdays: 'Weekdays',
  repeat_weekly: 'Every week',
  repeat_monthly: 'Every month',
  repeat_yearly: 'Every year',
  act_stop_repeat: 'Stop repeating',
  stopped_repeat: 'No longer repeats',

  a11y_views: 'Show',
  a11y_complete: 'Mark done: {title}',
  a11y_reopen: 'Mark not done: {title}',
  a11y_thought: 'Thought',

  ai_title: 'Tidy your notes with {name}?',
  ai_body: 'To turn what you say into one clear line, Hence sends {who}, through the Hence server:',
  ai_detail: 'The Hence server passes it on without keeping it. {company} processes it under its paid API terms: it is not used to train models, and may be kept for a limited time for abuse monitoring.',
  ai_sends_note: 'the text of each voice note — never the audio, and never your photos',
  ai_sends_context: 'the names and descriptions of the projects and the names of the people on your list, the titles and due dates of your open thoughts, and today’s date, time, time zone and language, so the note is read in context',
  ai_policy: 'Privacy policy',
  ai_company_claude: 'Anthropic',
  ai_company_gemini: 'Google',
  ai_allow: 'Allow',
  ai_decline: 'Don’t allow — keep notes on my iPhone',
  ai_change_later: 'You can change this at any time in Settings.',
  ai_section: 'Voice notes',
  ai_toggle: 'Tidy notes with {name}',
  ai_setting_note: 'When on, the text of each voice note, the names on your list and the titles of open thoughts are sent to {who} to be tidied. When off, notes are read only on your iPhone and nothing leaves it.',
  ai_who_claude: 'Anthropic’s Claude',
  ai_who_gemini: 'Google’s Gemini',
  ai_provider_now: 'Notes are tidied by {who}.',
} as const;

export type Key = keyof typeof EN;

const FR: Record<Key, string> = {
  thoughts_one: '1 pensée',
  thoughts_many: '{n} pensées',
  backup_section: 'Sauvegarde',
  backup_save: 'Sauvegarder mes pensées',
  backup_restore: 'Restaurer une sauvegarde',
  backup_note: 'Avec iCloud activé, une copie de vos pensées est gardée dans votre propre iCloud et revient si vous réinstallez l’app ou changez d’iPhone — nous ne la voyons jamais. Un fichier de sauvegarde est une seconde copie, photos comprises, que vous gardez vous-même. Restaurer ajoute ce qui manque et n’efface jamais rien.',
  icloud_saved: 'Enregistré dans votre iCloud à {time}',
  icloud_saving: 'Enregistrement dans votre iCloud…',
  icloud_off: 'iCloud est désactivé sur cet iPhone — gardez un fichier de sauvegarde',
  icloud_error: 'iCloud injoignable — nouvel essai bientôt',
  icloud_restoring: 'Récupération de vos pensées depuis iCloud…',
  icloud_restored: '{n} pensées récupérées depuis iCloud',
  backup_failed: 'La sauvegarde n’a pas pu être faite.',
  restore_not_backup: 'Ce fichier n’est pas une sauvegarde Hence.',
  restore_nothing: 'Tout ce qui est dans cette sauvegarde est déjà là.',
  restore_done: '{n} pensées restaurées',
  nothing_kept: 'Rien de noté',
  meetings_one: '1 réunion',
  meetings_many: '{n} réunions',
  meetings_none: 'Plus rien',
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
  agenda_empty: 'Plus rien cette semaine.',
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
  take_photo: 'Prendre une photo',
  photo_attached: 'Photo',
  photo_thought: 'Photo',
  photo_text: 'Texte de la photo',
  photo_reading: 'Lecture du texte de la photo…',
  photo_read: 'Texte lu — vous pourrez le rechercher',
  wn_title_welcome: 'Bienvenue dans Hence',
  wn_title_update: 'Quoi de neuf',
  wn_version: 'Version {version}',
  wn_continue: 'Continuer',
  wn_speak_title: 'Touchez l’orbe et parlez',
  wn_speak_body: 'Ce que vous dites devient une ligne claire. Dites « rappelle-moi demain à neuf heures » et le rappel est réglé.',
  wn_act_title: 'Touchez une pensée pour agir',
  wn_act_body: 'Fait, rappel, e-mail, calendrier, partage. Glissez à droite pour la terminer, à gauche pour la supprimer.',
  wn_private_title: 'Tout reste sur votre iPhone',
  wn_private_body: 'Pas de compte, pas de pub, pas de pistage. Vos notes sont lues sur votre iPhone et y restent — rien ne part vers un service d’IA.',
  wn_photo_text_title: 'Des photos qu’on retrouve',
  wn_photo_text_body: 'Hence lit le texte de vos photos — un tableau blanc, une carte de visite — sur votre iPhone. Cherchez un mot pour retrouver la photo.',
  wn_newline_title: 'Dites « à la ligne »',
  wn_newline_body: 'Vous dictez une liste ? Dites « à la ligne » et la suite passe sur une nouvelle ligne.',
  wn_reminders_title: 'Des rappels dits à votre façon',
  wn_reminders_body: '« À neuf heures et demie », « à midi », « dans une demi-heure » — dans toutes les langues de Hence.',
  wn_swipe_title: 'Glisser pour supprimer, tout de suite',
  wn_swipe_body: 'Une pensée que vous venez de dicter peut être supprimée d’un glissement, immédiatement.',
  wn_look_title: 'Choisissez un style',
  wn_look_body: 'Réglages › Style : Tableau, Carnet, Bulles, Ciel, Galets, Orbite et d’autres — chacun en sombre et en clair.',
  wn_lang_title: 'Six langues',
  wn_lang_body: 'Hence parle et comprend désormais aussi l’italien, l’espagnol et l’allemand. Choisissez la langue parlée en haut de l’écran principal.',
  wn_voice_title: 'Vos mots prennent vie',
  wn_voice_body: 'Pendant que vous parlez, la couleur respire avec votre voix, et ce que Hence comprend — un rappel, un nom, un retour à la ligne — s’allume au moment où vous le dites.',
  wn_backdrop_title: 'Un arrière-plan à vous',
  wn_backdrop_body: 'Réglages › Arrière-plan : un dessin doux signé Hence, ou l’une de vos photos — elle reste sur votre iPhone.',
  meeting_yours: 'Vous organisez cette réunion',
  meeting_organized_by: 'Organisée par {name}',
  meeting_cancel: 'Annuler la réunion',
  meeting_cancel_confirm: '« {subject} » sera annulée et tous les participants prévenus.',
  meeting_cancelled: 'Réunion annulée — participants prévenus',
  meeting_decline: 'Refuser',
  meeting_decline_confirm: 'L’organisateur de « {subject} » sera prévenu que vous ne venez pas, avec : « Désolé, je ne pourrai pas assister à cette réunion. »',
  meeting_decline_message: 'Désolé, je ne pourrai pas assister à cette réunion.',
  meeting_declined: 'Refusée — l’organisateur est prévenu',
  meeting_write: 'Écrire à l’organisateur',
  meeting_mail_subject: 'À propos de :',
  meeting_failed: 'Le calendrier ne l’a pas accepté.',
  meeting_refresh: 'Tirez l’agenda vers le bas pour l’actualiser, puis réessayez.',
  wn_meeting_title: 'Répondre à une réunion depuis l’agenda',
  wn_meeting_body: 'Touchez une réunion pour l’annuler si c’est la vôtre, la refuser sinon, ou écrire à l’organisateur.',
  type_placeholder: 'À quoi pensez-vous ?',
  cancel: 'Annuler',
  save: 'Enregistrer',
  captured_reminded: 'Noté · rappel {when}',
  act_edit: 'Modifier',
  edit_saved: 'Enregistré',
  edit_note_placeholder: 'Note (facultatif)',
  done_sheet: 'Terminé',

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
  perm_mic_title: 'Hence ne vous entend pas',
  perm_mic_body: 'Le micro ou la reconnaissance vocale est désactivé pour Hence. Activez-les dans les Réglages de l’iPhone pour dicter vos pensées.',
  perm_camera_title: 'Hence n’a pas accès à l’appareil photo',
  perm_camera_body: 'L’appareil photo est désactivé pour Hence. Activez-le dans les Réglages de l’iPhone pour photographier une pensée.',
  perm_open_settings: 'Ouvrir les Réglages',

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
  remind_pick: 'Choisir la date et l’heure',
  remind_pick_confirm: 'Créer le rappel',
  remind_pick_past: 'Ce moment est déjà passé.',
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
  connect_calendar: 'Non connecté — appuyez pour connecter',
  calendar_email_placeholder: 'Votre adresse Microsoft',
  calendar_continue: 'Continuer',
  disconnect_calendar: 'Déconnecter',
  calendar_note: 'Une fois connecté, les pensées deviennent des événements dans votre calendrier et votre semaine apparaît dans l’Agenda. Connectez les deux et ils s’affichent ensemble.',
  connecting: 'Connexion…',
  connect_failed: 'Connexion à Microsoft impossible',
  connected_as: 'Connecté',
  added_to_calendar: 'Ajouté à votre calendrier',
  settings: 'Réglages',
  appearance: 'Apparence',
  theme_dark: 'Sombre',
  theme_light: 'Clair',
  look_section: 'Style',
  look_classic: 'Classique',
  look_pinboard: 'Tableau',
  look_notebook: 'Carnet',
  look_bubbles: 'Bulles',
  look_sky: 'Ciel',
  look_pebbles: 'Galets',
  look_onething: 'Une chose',
  look_nowlater: 'Là / Après',
  look_moodboard: 'Planche',
  look_orbit: 'Orbite',
  backdrop_section: 'Arrière-plan',
  backdrop_none: 'Aucun',
  backdrop_mine: 'Ma photo',
  zone_now: 'Maintenant',
  zone_later: 'Plus tard',
  language: 'Langue de l’interface',
  language_note: 'Ce que vous lisez. La langue parlée se choisit en haut de l’écran principal, à côté de la recherche.',
  speech_lang: 'Je parle {lang}',
  speech_auto: 'n’importe quelle langue',
  voice_diagnostics: 'Dernier enregistrement',
  voice_diagnostics_note: 'Ce que chaque langue en a compris, avec la vraisemblance et la confiance. La coche a gagné.',
  speech_auto_short: 'AUTO',
  speech_auto_now: 'Écoute dans toutes les langues',
  speech_lang_now: 'Écoute en {lang}',
  about: 'À propos',
  privacy_policy: 'Politique de confidentialité',
  support: 'Assistance',

  repeat_daily: 'Chaque jour',
  repeat_weekdays: 'En semaine',
  repeat_weekly: 'Chaque semaine',
  repeat_monthly: 'Chaque mois',
  repeat_yearly: 'Chaque année',
  act_stop_repeat: 'Ne plus répéter',
  stopped_repeat: 'Ne se répète plus',

  a11y_views: 'Afficher',
  a11y_complete: 'Marquer comme terminé : {title}',
  a11y_reopen: 'Marquer comme non terminé : {title}',
  a11y_thought: 'Pensée',

  ai_title: 'Mettre vos notes au propre avec {name} ?',
  ai_body: 'Pour transformer ce que vous dites en une ligne claire, Hence envoie à {who}, via le serveur Hence :',
  ai_detail: 'Le serveur Hence transmet sans rien conserver. {company} traite ces données selon les conditions de son API payante : elles ne servent pas à entraîner de modèles et peuvent être conservées un temps limité pour la détection des abus.',
  ai_sends_note: 'le texte de chaque note vocale — jamais l’audio, ni vos photos',
  ai_sends_context: 'les noms et descriptions des projets et les noms des personnes de votre liste, les titres et échéances de vos pensées en cours, ainsi que la date, l’heure, le fuseau horaire et la langue, pour que la note soit comprise dans son contexte',
  ai_policy: 'Politique de confidentialité',
  ai_company_claude: 'Anthropic',
  ai_company_gemini: 'Google',
  ai_allow: 'Autoriser',
  ai_decline: 'Ne pas autoriser — garder sur mon iPhone',
  ai_change_later: 'Modifiable à tout moment dans les Réglages.',
  ai_section: 'Notes vocales',
  ai_toggle: 'Mettre au propre avec {name}',
  ai_setting_note: 'Activé : le texte de chaque note vocale, les noms de votre liste et les titres des pensées en cours sont envoyés à {who} pour être mis au propre. Désactivé : les notes sont lues uniquement sur votre iPhone et rien n’en sort.',
  ai_who_claude: 'Claude, d’Anthropic',
  ai_who_gemini: 'Gemini, de Google',
  ai_provider_now: 'Les notes sont mises au propre par {who}.',
};

const ZH: Record<Key, string> = {
  thoughts_one: '1 条想法',
  thoughts_many: '{n} 条想法',
  backup_section: '备份',
  backup_save: '备份我的想法',
  backup_restore: '从备份恢复',
  backup_note: '开启 iCloud 后，你的想法会在你自己的 iCloud 中保存一份副本，重装 App 或更换 iPhone 时会自动恢复——我们永远看不到它。备份文件是你自己保存的第二份副本（包含照片）。恢复只会添加缺少的内容，绝不会删除任何东西。',
  icloud_saved: '已于 {time} 保存到你的 iCloud',
  icloud_saving: '正在保存到你的 iCloud…',
  icloud_off: '此 iPhone 未开启 iCloud——请保存备份文件',
  icloud_error: '无法连接 iCloud，稍后会重试',
  icloud_restoring: '正在从 iCloud 恢复你的想法…',
  icloud_restored: '已从 iCloud 恢复 {n} 条想法',
  backup_failed: '无法完成备份。',
  restore_not_backup: '这不是 Hence 的备份文件。',
  restore_nothing: '此备份中的内容都已存在。',
  restore_done: '已恢复 {n} 条想法',
  nothing_kept: '暂无记录',
  meetings_one: '1 个会议',
  meetings_many: '{n} 个会议',
  meetings_none: '没有安排了',
  search: '搜索',
  done_today: '今天已完成 {n} 条',
  clear_done: '清除',
  deleted_many: '已删除 {n} 条',
  clear_confirm_title: '清除已完成的想法？',
  clear_confirm_body: '将删除 {n} 条，删除后可立即撤销。',
  empty_title: '在想什么？',
  empty_hint: '点击麦克风，开口说。',
  empty_search: '没有找到。',
  agenda: '日程',
  business: '工作',
  agenda_today: '今天的会议',
  agenda_empty: '本周没有剩余安排。',
  agenda_today_header: '今天',
  agenda_tomorrow_header: '明天',
  agenda_nothing_left: '今天没有剩余安排。',
  agenda_nothing_tomorrow: '明天没有安排。',
  agenda_now: '进行中',
  agenda_stale: '离线 · 更新于 {time} · 点击重试',
  agenda_loading: '正在读取日历…',
  agenda_failed: '无法连接到日历。',
  agenda_connect: '在设置中连接 Outlook，即可在此查看会议。',
  agenda_all_day: '全天',
  retry: '重试',
  private: '私人',

  listening: '正在聆听',
  thinking: '请稍候',
  say_something: '说出你的想法…',
  done: '完成',
  capture: '记录',
  take_photo: '拍照',
  photo_attached: '照片',
  photo_thought: '照片',
  photo_text: '照片中的文字',
  photo_reading: '正在读取照片中的文字…',
  photo_read: '文字已读取，可以搜索',
  wn_title_welcome: '欢迎使用 Hence',
  wn_title_update: '新功能',
  wn_version: '版本 {version}',
  wn_continue: '继续',
  wn_speak_title: '轻点圆球，开口说',
  wn_speak_body: '你说的话会变成一条清晰的内容。说“明天早上九点提醒我”，提醒就设好了。',
  wn_act_title: '轻点想法即可处理',
  wn_act_body: '完成、提醒、邮件、日历、分享。向右滑完成，向左滑删除。',
  wn_private_title: '一切都留在你的 iPhone 上',
  wn_private_body: '无需账户，没有广告，没有追踪。你的笔记在 iPhone 上处理并保存在那里——不会发送给任何 AI 服务。',
  wn_photo_text_title: '照片也能搜索',
  wn_photo_text_body: 'Hence 会在你的 iPhone 上读取照片中的文字——白板、名片等。搜索其中的文字即可找到照片。',
  wn_newline_title: '说“换行”',
  wn_newline_body: '在口述清单？说“换行”，接下来的内容就会另起一行。',
  wn_reminders_title: '用你习惯的方式设提醒',
  wn_reminders_body: '“九点半”“中午”“半小时后”——Hence 支持的所有语言都可以。',
  wn_swipe_title: '立即滑动删除',
  wn_swipe_body: '刚刚记下的想法，也能立刻滑动删除。',
  wn_look_title: '选择一种风格',
  wn_look_body: '设置 › 风格：便签板、笔记本、气泡、夜空、鹅卵石、轨道等，每种都有深色和浅色。',
  wn_lang_title: '六种语言',
  wn_lang_body: 'Hence 现在也会说、也能听懂意大利语、西班牙语和德语。在主屏幕顶部选择你说的语言。',
  wn_voice_title: '看着你的话亮起来',
  wn_voice_body: '说话时，色彩随你的声音起伏；Hence 理解到的内容——提醒、人名、换行——会在你说出时亮起。',
  wn_backdrop_title: '属于你的背景',
  wn_backdrop_body: '设置 › 背景：选择 Hence 绘制的柔和图案，或你自己的一张照片——照片只保存在你的 iPhone 上。',
  meeting_yours: '你是这个会议的组织者',
  meeting_organized_by: '组织者：{name}',
  meeting_cancel: '取消会议',
  meeting_cancel_confirm: '“{subject}”将被取消，并通知所有参会者。',
  meeting_cancelled: '会议已取消，已通知参会者',
  meeting_decline: '拒绝',
  meeting_decline_confirm: '将通知“{subject}”的组织者你不参加，并附上：“抱歉，我无法参加这次会议。”',
  meeting_decline_message: '抱歉，我无法参加这次会议。',
  meeting_declined: '已拒绝，已通知组织者',
  meeting_write: '给组织者发邮件',
  meeting_mail_subject: '关于：',
  meeting_failed: '日历未接受此操作。',
  meeting_refresh: '下拉日程以刷新，然后重试。',
  wn_meeting_title: '在日程中直接回复会议',
  wn_meeting_body: '轻点会议：自己组织的可以取消，别人组织的可以拒绝，也可以给组织者发邮件。',
  type_placeholder: '在想什么？',
  cancel: '取消',
  save: '保存',
  captured_reminded: '已记录 · {when}提醒',
  act_edit: '编辑',
  edit_saved: '已保存',
  edit_note_placeholder: '备注（可选）',
  done_sheet: '完成',

  captured: '已记录',
  captured_many: '已记录 {n} 条',
  captured_step: '已添加为步骤',
  on_device_suffix: '本机分析',

  err_not_allowed: '请在“设置”中允许使用麦克风。',
  err_plugin: '此版本缺少语音功能。',
  err_unsupported: '此设备不支持语音输入。',
  err_network: '语音转写需要网络连接。',
  err_no_speech: '没有听清。',
  err_other: '录音被中断。',
  perm_mic_title: 'Hence 听不到你',
  perm_mic_body: 'Hence 的麦克风或语音识别已关闭。请在 iPhone 的“设置”中开启，才能说出你的想法。',
  perm_camera_title: 'Hence 无法使用相机',
  perm_camera_body: 'Hence 的相机权限已关闭。请在 iPhone 的“设置”中开启，才能拍下你的想法。',
  perm_open_settings: '打开设置',

  // Time first: "2分钟前记录" reads naturally, "记录于 2分钟前" does not.
  captured_at: '{when}记录',
  tomorrow_at: '明天 {time}',
  act_done: '完成',
  act_reopen: '恢复为未完成',
  act_important: '重要',
  act_not_important: '取消重要',
  act_remind: '提醒我',
  act_change_remind: '修改提醒',
  act_move_private: '移至私人',
  act_move_business: '移至工作',
  act_email: '转为邮件',
  act_calendar: '添加到日历',
  act_share: '分享',
  act_delete: '删除',

  remind_title: '提醒我',
  remind_hour: '一小时后',
  remind_evening: '今晚',
  remind_tomorrow: '明天早上',
  remind_next_week: '下周',
  remind_remove: '删除提醒',
  remind_pick: '选择日期和时间',
  remind_pick_confirm: '设置提醒',
  remind_pick_past: '该时间已经过去了。',
  reminder_set: '提醒 {when}',
  reminder_set_no_perm: '已设置提醒，请允许通知以便接收',
  reminder_removed: '已删除提醒',

  marked_important: '已标记为重要',
  unmarked_important: '已取消重要',
  moved_to: '已移至{space}',
  deleted: '已删除',
  undo: '撤销',
  copied: '已复制',

  calendar: '日历',
  connect_calendar: '未连接 — 点击连接',
  calendar_email_placeholder: '你的 Microsoft 邮箱',
  calendar_continue: '继续',
  disconnect_calendar: '断开连接',
  calendar_note: '连接后，想法会成为你日历中的事件，本周安排会显示在日程中。两个都连接则会一起显示。',
  connecting: '正在连接…',
  connect_failed: '无法连接到 Microsoft',
  connected_as: '已连接',
  added_to_calendar: '已添加到日历',
  settings: '设置',
  appearance: '外观',
  theme_dark: '深色',
  theme_light: '浅色',
  look_section: '风格',
  look_classic: '经典',
  look_pinboard: '便签板',
  look_notebook: '笔记本',
  look_bubbles: '气泡',
  look_sky: '夜空',
  look_pebbles: '鹅卵石',
  look_onething: '专注一件',
  look_nowlater: '现在 / 稍后',
  look_moodboard: '灵感板',
  look_orbit: '轨道',
  backdrop_section: '背景',
  backdrop_none: '无',
  backdrop_mine: '我的照片',
  zone_now: '现在',
  zone_later: '稍后',
  language: '界面语言',
  language_note: '界面显示的语言。说话的语言在主屏幕顶部、搜索旁边选择。',
  speech_lang: '说话语言：{lang}',
  speech_auto: '任意语言',
  voice_diagnostics: '最近一次录音',
  voice_diagnostics_note: '每种语言识别出的内容，以及匹配度和置信度。带勾的是最终选用的。',
  speech_auto_short: '自动',
  speech_auto_now: '自动识别语言',
  speech_lang_now: '正在用{lang}识别',
  about: '关于',
  privacy_policy: '隐私政策',
  support: '支持',

  repeat_daily: '每天',
  repeat_weekdays: '工作日',
  repeat_weekly: '每周',
  repeat_monthly: '每月',
  repeat_yearly: '每年',
  act_stop_repeat: '停止重复',
  stopped_repeat: '已停止重复',

  a11y_views: '显示',
  a11y_complete: '标记为完成：{title}',
  a11y_reopen: '标记为未完成：{title}',
  a11y_thought: '想法',

  ai_title: '用 {name} 整理你的笔记？',
  ai_body: '为了把你说的话整理成一行清晰的内容，Hence 会通过 Hence 服务器发送给 {who}：',
  ai_detail: 'Hence 服务器只做转发，不保存任何内容。{company} 按其付费 API 条款处理这些数据：不会用于训练模型，可能为防止滥用而短期保留。',
  ai_sends_note: '每条语音笔记的文字——绝不发送音频，也不发送你的照片',
  ai_sends_context: '你列表中的项目名称和说明、人名，进行中想法的标题和截止日期，以及当前日期、时间、时区和语言，以便结合上下文理解笔记',
  ai_policy: '隐私政策',
  ai_company_claude: 'Anthropic',
  ai_company_gemini: 'Google',
  ai_allow: '允许',
  ai_decline: '不允许——只保留在我的 iPhone 上',
  ai_change_later: '你可以随时在“设置”中更改。',
  ai_section: '语音笔记',
  ai_toggle: '用 {name} 整理笔记',
  ai_setting_note: '开启时，每条语音笔记的文字、列表中的名称和进行中想法的标题会发送给 {who} 进行整理。关闭时，笔记只在你的 iPhone 上处理，不会离开设备。',
  ai_who_claude: 'Anthropic 的 Claude',
  ai_who_gemini: 'Google 的 Gemini',
  ai_provider_now: '笔记由 {who} 整理。',
};

const DICTIONARIES: Record<Lang, Record<Key, string>> = { en: EN, fr: FR, it: IT, es: ES, de: DE, zh: ZH };
/** Kept checked by the build, ready for when Arabic is offered. */
export const ARABIC_CAPTIONS: Record<Key, string> = AR;

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
    it: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' },
    es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' },
    de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
    ar: { morning: 'صباح الخير', afternoon: 'نهارك سعيد', evening: 'مساء الخير' },
    zh: { morning: '早上好', afternoon: '下午好', evening: '晚上好' },
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

/** How often a thought comes back, in the chosen language. */
export function repeatLabel(freq: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'): string {
  const key = ({ daily: 'repeat_daily', weekdays: 'repeat_weekdays', weekly: 'repeat_weekly', monthly: 'repeat_monthly', yearly: 'repeat_yearly' } as const)[freq];
  return t(key);
}

export const timeIn = (d: Date): string => d.toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' });

export const dayTimeIn = (d: Date): string =>
  d.toLocaleString(localeOf(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
