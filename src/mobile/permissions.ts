import { confirmAction, openAppSettings } from '@/lib/native/bridge';
import { t } from './i18n';

/**
 * Say why nothing happened when the camera or microphone has been refused.
 *
 * iOS asks for each permission once. After a "Don't Allow" — or a switch
 * turned off in Settings — the button the person just pressed would do
 * nothing at all, which reads as a broken app. This says what is missing and
 * offers the one way back: Hence's page in the iPhone's Settings.
 */
export async function explainBlocked(what: 'camera' | 'microphone'): Promise<void> {
  const open = await confirmAction(
    t(what === 'camera' ? 'perm_camera_body' : 'perm_mic_body'),
    t(what === 'camera' ? 'perm_camera_title' : 'perm_mic_title'),
    { ok: t('perm_open_settings'), cancel: t('cancel') },
  );
  if (open) await openAppSettings();
}
