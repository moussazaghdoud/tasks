import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { createId } from '@/lib/id';
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
 * and Claude is only ever told the sentence you spoke.
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
export async function capturePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
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

/** A URL the web view can show this photograph at. */
export async function photoUrl(name: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ path: `${FOLDER}/${name}`, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
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
