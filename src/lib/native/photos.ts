import { Capacitor, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { createId } from '@/lib/id';
import { ws } from '@/store/workspace';
import { isNative } from './platform';

/**
 * Photographs kept with a thought.
 *
 * Half of what is worth remembering is something you are looking at: a
 * whiteboard at the end of a meeting, a label, a parking level. Saying what it
 * is takes a second; typing what it says takes a minute.
 *
 * The photograph never leaves the phone. It is written into the app's own
 * storage — not the camera roll, which would put your whiteboards among your
 * holidays — and the thought keeps only its filename. Nothing is uploaded,
 * and Claude is only ever told the sentence you spoke. The words in the
 * picture are read on the phone too, and stay there.
 */

const FOLDER = 'photos';

/** Whether this build can take a photograph at all. */
export const cameraAvailable = (): boolean => isNative();

/**
 * Take a photograph and keep it. Returns the stored name, or null if the
 * camera was closed without taking one.
 *
 * Long side 1600 and quality 72 is the point where a whiteboard is still
 * readable and a photo is a few hundred kilobytes rather than five megabytes.
 * This is the first thing in the app that grows without limit, so it is worth
 * being mean about.
 */
export async function capturePhoto(source: CameraSource = CameraSource.Camera): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      source,
      resultType: CameraResultType.Base64,
      quality: 72,
      width: 1600,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
    });
    if (!photo.base64String) return null;

    const name = `${createId('ph_')}.${photo.format === 'png' ? 'png' : 'jpg'}`;
    await Filesystem.writeFile({
      path: `${FOLDER}/${name}`,
      data: photo.base64String,
      directory: Directory.Data,
      recursive: true,
    });
    return name;
  } catch {
    // Cancelling is the usual reason, and cancelling is not a failure.
    return null;
  }
}

/**
 * Whether the camera has been refused — "Don't Allow" once, or switched off
 * in Settings. iOS will not ask again, so the app has to say so itself.
 */
export async function cameraBlocked(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { camera } = await Camera.checkPermissions();
    return camera === 'denied';
  } catch {
    return false;
  }
}

/** A URL the web view can show this photograph at. */
export async function photoUrl(name: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ path: `${FOLDER}/${name}`, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

const TextReader = registerPlugin<{
  read(options: { name: string }): Promise<{ text: string }>;
  readCode(options: { name: string }): Promise<{ codes: string[] }>;
}>('TextReader');

/**
 * Photograph a QR code — or pick a screenshot of one — and read it: how
 * someone's Hence code is scanned. The copy is deleted at once: it was only
 * ever a way to read the code. Null when nothing was taken or picked; an
 * empty list when no code was seen.
 */
export async function scanCode(from: 'camera' | 'library' = 'camera'): Promise<string[] | null> {
  const name = await capturePhoto(from === 'library' ? CameraSource.Photos : CameraSource.Camera);
  if (!name) return null;
  try {
    return (await TextReader.readCode({ name })).codes;
  } catch {
    return [];
  } finally {
    await Filesystem.deleteFile({ path: `${FOLDER}/${name}`, directory: Directory.Data }).catch(() => {});
  }
}

/**
 * The words in a photograph, read on the phone — a whiteboard, a business
 * card, a label. Empty when there are none or the phone cannot read them.
 */
export async function readPhotoText(name: string): Promise<string> {
  if (!isNative()) return '';
  try {
    const { text } = await TextReader.read({ name });
    return text.trim();
  } catch {
    return '';
  }
}

/** What a photograph captured without a word is called until its text is read. */
const UNNAMED = new Set(['Photo', '照片']);

/**
 * The first words read in a photograph, short enough to stand as a thought's
 * line: the first line that holds a letter or a digit, eight words at most.
 */
export function headlineOf(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /[\p{L}\p{N}]/u.test(l));
  if (!line) return '';
  const words = line.split(/\s+/);
  let out = words.slice(0, 8).join(' ');
  if (out.length > 48) return `${out.slice(0, 47).trimEnd()}…`;
  if (words.length > 8) out += '…';
  return out;
}

/**
 * Keep what was read with the thought. A photograph taken without a word is
 * named "Photo" until now; it takes the first words it holds instead — a
 * business card becomes the name on it. A thought already named by its
 * owner keeps its name.
 */
export function keepPhotoText(id: string, photoText: string): void {
  const task = ws().tasks[id];
  if (!task) return; // undone in the meantime
  const headline = headlineOf(photoText);
  ws().updateTask(id, headline && UNNAMED.has(task.title) ? { photoText, title: headline } : { photoText });
}

/**
 * Read the photographs no one has read yet: those taken before the phone
 * could, and any whose reading was interrupted. One at a time, in the
 * background, so launching the app stays quick.
 */
export async function readUnreadPhotos(): Promise<void> {
  if (!isNative()) return;
  const unread = Object.values(ws().tasks).filter((task) => task.photo && task.photoText === undefined);
  for (const task of unread) keepPhotoText(task.id, await readPhotoText(task.photo!));
}

/**
 * Delete the photographs no thought refers to any more.
 *
 * Run at launch rather than when a thought is deleted, because a deleted
 * thought can be undone from the toast for the next few seconds — and a
 * thought that comes back without its photograph is worse than a file that
 * lingers for a session.
 */
export async function sweepPhotos(kept: Iterable<string>): Promise<void> {
  if (!isNative()) return;
  const keep = new Set(kept);
  try {
    const { files } = await Filesystem.readdir({ path: FOLDER, directory: Directory.Data });
    for (const file of files) {
      if (keep.has(file.name)) continue;
      await Filesystem.deleteFile({ path: `${FOLDER}/${file.name}`, directory: Directory.Data }).catch(() => {});
    }
  } catch {
    /* no folder yet, which means nothing to sweep */
  }
}
