import { haptic } from '@/lib/native/bridge';
import { define } from '@/lib/know/define';
import { forget } from '@/lib/know/store';
import { openPro } from '@/lib/pro/limits';
import { toast } from '@/store/toast';
import { ws } from '@/store/workspace';
import { kt } from './knowI18n';
import { openEditor } from './knowUi';
import { currentSpace } from './space';

/**
 * Look a term up and say what came of it.
 *
 * `original` is what was said when the asking came from another tab ("Define
 * VXLAN" in Business). Those words are never lost: when the definition
 * cannot be made — nothing found, offline, the free month used up — they are
 * kept as a thought; when it is made, the toast offers to keep them as a
 * thought instead, for the times "define" began a task.
 */
export async function defineAndTell(term: string, original: string | null): Promise<void> {
  const keepAsThought = () => {
    if (original) ws().addTask({ title: original, space: currentSpace() });
  };
  const result = await define(term);

  if (result.kind === 'limit') {
    keepAsThought();
    openPro('know');
    return;
  }
  if (result.kind === 'offline') {
    keepAsThought();
    toast(kt('offline'));
    return;
  }
  if (result.kind === 'not-found') {
    keepAsThought();
    toast(kt('not_found', { term }), { action: { label: kt('write_own'), run: () => openEditor({ term }) } });
    return;
  }

  haptic('success');
  const { definition } = result;
  toast(
    kt('defined', { term: definition.term }),
    original
      ? {
          action: {
            label: kt('keep_thought'),
            run: () => {
              forget(definition.id);
              keepAsThought();
            },
          },
        }
      : undefined,
  );
}
