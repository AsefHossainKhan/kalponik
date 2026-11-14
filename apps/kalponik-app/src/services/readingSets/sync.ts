import type { EnvConfigType } from '@/services/environment';
import { isTauriAppPlatform } from '@/services/environment';
import { publishReplicaUpsert } from '@/services/sync/replicaPublish';
import {
  READING_SET_KIND,
  parseReadingSetReplicaId,
  readingSetReplicaId,
  type ReadingSetRecord,
} from '@/services/sync/adapters/readingSet';
import { useSettingsStore } from '@/store/settingsStore';
import { getOSPlatform } from '@/utils/misc';
import { updateReadingSet } from './actions';
import type { ReadingGroup, ReadingPlatform, ReadingSetState } from './model';
import { setReadingSetPublisher } from './routing';

// Kalponik: reading sets travel through the replica sync, one row per
// account, platform and kind of book. A phone and the web never overwrite
// each other: each only reads and writes its own platform's rows.

export const getReadingPlatform = (): ReadingPlatform => {
  if (!isTauriAppPlatform()) return 'web';
  const os = getOSPlatform();
  if (os === 'android') return 'android';
  if (os === 'ios') return 'ios';
  return 'desktop';
};

/** Slider drags save often; the server gets the newest state at most every 2 s. */
export const PUBLISH_DELAY_MS = 2000;

const timers = new Map<ReadingGroup, ReturnType<typeof setTimeout>>();

export const publishNow = (group: ReadingGroup, state: ReadingSetState) => {
  const id = readingSetReplicaId(getReadingPlatform(), group);
  const record: ReadingSetRecord = { name: id, state };
  return publishReplicaUpsert(READING_SET_KIND, record, id);
};

export const installReadingSetSync = (delayMs = PUBLISH_DELAY_MS) => {
  setReadingSetPublisher((group, state) => {
    const pending = timers.get(group);
    if (pending) clearTimeout(pending);
    timers.set(
      group,
      setTimeout(() => {
        timers.delete(group);
        void publishNow(group, state).catch((err) =>
          console.warn('Failed to sync the reading set', err),
        );
      }, delayMs),
    );
  });
};

/** A row pulled from the server: this platform's rows only. */
export const applyRemoteReadingSet = async (
  envConfig: EnvConfigType,
  record: ReadingSetRecord,
): Promise<boolean> => {
  const parsed = parseReadingSetReplicaId(record.name);
  if (!parsed || parsed.platform !== getReadingPlatform()) return false;
  const local = useSettingsStore.getState().settings.readingSets?.[parsed.group];
  if (local && JSON.stringify(local) === JSON.stringify(record.state)) return false;
  await updateReadingSet(envConfig, parsed.group, () => record.state, { publish: false });
  return true;
};

/** The local record for a replica id, so the pull can tell what it has. */
export const findLocalReadingSet = (id: string): ReadingSetRecord | undefined => {
  const parsed = parseReadingSetReplicaId(id);
  if (!parsed || parsed.platform !== getReadingPlatform()) return undefined;
  const state = useSettingsStore.getState().settings.readingSets?.[parsed.group];
  return state ? { name: id, state } : undefined;
};
