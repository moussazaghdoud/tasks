import { useSyncExternalStore } from 'react';

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
export type Lang = 'en' | 'fr' | 'zh';

export const LANGUAGES: Array<{ id: Lang; native: string; short: string; locale: string }> = [
  { id: 'en', native: 'English', short: 'EN', locale: 'en-US' },
  { id: 'fr', native: 'Français', short: 'FR', locale: 'fr-FR' },
  // Simplified, as used in mainland China. The recogniser takes zh-CN too,
  // and Claude writes the thought back in the language it heard.
  { id: 'zh', native: '简体中文', short: '中文', locale: 'zh-CN' },
];

const KEY = 'hence.lang';
const SPEECH_KEY = 'hence.speech';

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'fr' || value === 'zh';

function stored(key: string): Lang | null {
  try {
    const value = localStorage.getItem(key);
    return isLang(value) ? value : null;
  } catch {
    /* private browsing */
    return null;
  }
}

function detect(): Lang {
  const chosen = stored(KEY);
  if (chosen) return chosen;
  const phone = typeof navigator !== 'undefined' ? navigator.language : '';
  if (/^fr/i.test(phone)) return 'fr';
  if (/^zh/i.test(phone)) return 'zh';
  return 'en';
}

let current: Lang = detect();
/** Null until someone picks a spoken language: until then it follows the interface. */
let spoken: Lang | null = stored(SPEECH_KEY);
const listeners = new Set<() => void>();

export const currentLang = (): Lang => current;
export const speechLang = (): Lang => spoken ?? current;

/** BCP-47 tag, for `Intl` and for the speech recogniser. */
export const localeOf = (lang: Lang = current): string => LANGUAGES.find((l) => l.id === lang)!.locale;

/** What the microphone listens for. */
export const speechLocale = (): string => localeOf(speechLang());

function remember(key: string, value: Lang): void {
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
  for (const notify of listeners) notify();
}

export function setSpeechLang(next: Lang): void {
  if (next === spoken) return;
  spoken = next;
  remember(SPEECH_KEY, next);
  for (const notify of listeners) notify();
}

/** The next spoken language in the list, so one tap moves through them. */
export const nextSpeechLang = (): Lang => {
  const at = LANGUAGES.findIndex((l) => l.id === speechLang());
  return LANGUAGES[(at + 1) % LANGUAGES.length].id;
};

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useLang = (): Lang => useSyncExternalStore(subscribe, () => current, () => 'en');
export const useSpeechLang = (): Lang => useSyncExternalStore(subscribe, speechLang, () => 'en');

/* ------------------------------------------------------------------ */

const EN = {
  thoughts_one: '1 thought',
  thoughts_many: '{n} thoughts',
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
  type_placeholder: 'What’s on your mind?',
  cancel: 'Cancel',
  save: 'Save',
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
  calendar_email_placeholder: 'Your Microsoft email',
  calendar_continue: 'Continue',
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
  language: 'Interface language',
  language_note: 'What you read. The language you speak is picked at the top of the main screen, next to search.',
  speech_lang: 'Speaking {lang}',
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

  ai_title: 'Tidy your notes with Claude?',
  ai_body: 'Hence can send the text of each voice note — never the audio — to Anthropic’s Claude, which turns what you said into one clear line.',
  ai_detail: 'The names of people and projects on your list go with it, so they are recognised. Nothing is stored on the way, and nothing is used to train models.',
  ai_allow: 'Allow',
  ai_decline: 'Keep it on my iPhone',
  ai_change_later: 'You can change this at any time in Settings.',
  ai_section: 'Voice notes',
  ai_toggle: 'Tidy notes with Claude',
  ai_setting_note: 'When on, the text of each note is sent to Anthropic’s Claude to be cleaned up. When off, notes are read on your iPhone and nothing leaves it.',
} as const;

type Key = keyof typeof EN;

const FR: Record<Key, string> = {
  thoughts_one: '1 pensée',
  thoughts_many: '{n} pensées',
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
  type_placeholder: 'À quoi pensez-vous ?',
  cancel: 'Annuler',
  save: 'Enregistrer',
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
  calendar_email_placeholder: 'Votre adresse Microsoft',
  calendar_continue: 'Continuer',
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
  language: 'Langue de l’interface',
  language_note: 'Ce que vous lisez. La langue parlée se choisit en haut de l’écran principal, à côté de la recherche.',
  speech_lang: 'Je parle {lang}',
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

  ai_title: 'Mettre vos notes au propre avec Claude ?',
  ai_body: 'Hence peut envoyer le texte de chaque note vocale — jamais l’audio — à Claude, d’Anthropic, qui transforme ce que vous avez dit en une ligne claire.',
  ai_detail: 'Les noms des personnes et des projets de votre liste l’accompagnent, pour être reconnus. Rien n’est conservé en chemin, et rien ne sert à entraîner des modèles.',
  ai_allow: 'Autoriser',
  ai_decline: 'Garder sur mon iPhone',
  ai_change_later: 'Modifiable à tout moment dans les Réglages.',
  ai_section: 'Notes vocales',
  ai_toggle: 'Mise au propre par Claude',
  ai_setting_note: 'Activé, le texte de chaque note est envoyé à Claude, d’Anthropic, pour être mis au propre. Désactivé, les notes sont lues sur votre iPhone et rien n’en sort.',
};

const ZH: Record<Key, string> = {
  thoughts_one: '1 条想法',
  thoughts_many: '{n} 条想法',
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
  type_placeholder: '在想什么？',
  cancel: '取消',
  save: '保存',
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
  connect_calendar: '连接 Outlook',
  calendar_email_placeholder: '你的 Microsoft 邮箱',
  calendar_continue: '继续',
  disconnect_calendar: '断开连接',
  calendar_note: '连接后，想法会成为你日历中的事件；否则将通过分享面板发送。',
  connecting: '正在连接…',
  connect_failed: '无法连接到 Microsoft',
  connected_as: '已连接',
  added_to_calendar: '已添加到日历',
  settings: '设置',
  appearance: '外观',
  theme_dark: '深色',
  theme_light: '浅色',
  language: '界面语言',
  language_note: '界面显示的语言。说话的语言在主屏幕顶部、搜索旁边选择。',
  speech_lang: '说话语言：{lang}',
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

  ai_title: '用 Claude 整理你的笔记？',
  ai_body: 'Hence 可以将每条语音笔记的文字（绝不包括音频）发送给 Anthropic 的 Claude，由它把你说的话整理成一条清晰的内容。',
  ai_detail: '列表中的人名和项目名会一并发送，以便准确识别。传输过程中不会保存任何内容，也不会用于训练模型。',
  ai_allow: '允许',
  ai_decline: '仅保留在我的 iPhone 上',
  ai_change_later: '你可以随时在“设置”中更改。',
  ai_section: '语音笔记',
  ai_toggle: '用 Claude 整理笔记',
  ai_setting_note: '开启后，每条笔记的文字会发送给 Anthropic 的 Claude 进行整理。关闭后，笔记只在你的 iPhone 上处理，不会离开设备。',
};

const DICTIONARIES: Record<Lang, Record<Key, string>> = { en: EN, fr: FR, zh: ZH };

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
