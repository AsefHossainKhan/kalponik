// @vitest-environment happy-dom
import { describe, expect, test, vi, beforeEach } from 'vitest';

const publishMock = vi.fn(async () => {});
vi.mock('@/services/sync/replicaPublish', () => ({
  publishReplicaUpsert: (...args: unknown[]) => publishMock(...(args as [])),
}));
const updateMock = vi.fn(async () => ({}));
vi.mock('@/services/readingSets/actions', () => ({
  updateReadingSet: (...args: unknown[]) => updateMock(...(args as [])),
}));

import {
  fromFields,
  parseReadingSetReplicaId,
  readingSetAdapter,
} from '@/services/sync/adapters/readingSet';
import { validateRow } from '@/libs/replicaSchemas';
import { createSetState, saveToSlot, type ReadingSetState } from '@/services/readingSets/model';
import { publishReadingSet } from '@/services/readingSets/routing';
import { applyRemoteReadingSet, installReadingSetSync } from '@/services/readingSets/sync';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';
import type { Hlc, ReplicaRow } from '@/types/replica';
import type { SystemSettings } from '@/types/settings';

const state = (): ReadingSetState =>
  saveToSlot(createSetState({ defaultFontSize: 20, readerThemeMode: 'dark' }, 'night'), 1, 'Bed');

const row = (id: string, fields: Record<string, unknown>): ReplicaRow => {
  const t = '0000000000001-0000-dev' as Hlc;
  return {
    user_id: 'u',
    kind: 'reading_set',
    replica_id: id,
    fields_jsonb: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { v, t, s: 'dev' }]),
    ),
    updated_at_ts: t,
    deleted_at_ts: null,
    manifest_jsonb: null,
    reincarnation: null,
    schema_version: 1,
  } as unknown as ReplicaRow;
};

describe('reading set rows', () => {
  test('ids are <platform>.<kind>, nothing else', () => {
    expect(parseReadingSetReplicaId('android.text')).toEqual({
      platform: 'android',
      group: 'text',
    });
    expect(parseReadingSetReplicaId('web.fixed')).toEqual({ platform: 'web', group: 'fixed' });
    expect(parseReadingSetReplicaId('web.text.x')).toBeNull();
    expect(parseReadingSetReplicaId('tv.text')).toBeNull();
    expect(parseReadingSetReplicaId('web.audio')).toBeNull();
  });

  test('a state survives the round trip through row fields', () => {
    const packed = readingSetAdapter.pack({ name: 'web.text', state: state() });
    const back = readingSetAdapter.unpackRow!(row('web.text', packed));
    expect(back).toEqual({ name: 'web.text', state: state() });
  });

  test('each slot is its own field, so two devices can edit different slots', () => {
    const packed = readingSetAdapter.pack({ name: 'web.text', state: state() });
    expect(Object.keys(packed).sort()).toEqual(
      ['active', 'basedOn', 'current', 'slot1', 'slot2', 'slot3'].sort(),
    );
    expect(packed['slot1']).toBe(false);
    expect(packed['slot2']).toMatchObject({ name: 'Bed' });
  });

  test('unknown fields in values are refused, and an active empty slot is dropped', () => {
    expect(fromFields({ current: { evil: 'x' } })).toBeNull();
    const parsed = fromFields({ current: {}, active: 2, slot3: false });
    expect(parsed?.active).toBeNull();
  });

  test('the server accepts a valid row and refuses a bad id or a bad value', () => {
    const packed = readingSetAdapter.pack({ name: 'web.text', state: state() });
    expect(validateRow(row('android.text', packed)).ok).toBe(true);
    expect(validateRow(row('android.comics', packed)).ok).toBe(false);
    expect(validateRow(row('web.text', { ...packed, current: { userStylesheet: 'x' } })).ok).toBe(
      false,
    );
    expect(validateRow(row('web.text', { ...packed, extra: 1 })).ok).toBe(false);
  });
});

describe('reading set sync', () => {
  beforeEach(() => {
    publishMock.mockClear();
    updateMock.mockClear();
  });

  test('changes go out once, after the burst, as the web row', async () => {
    vi.useFakeTimers();
    installReadingSetSync(2000);
    const a = createSetState({ defaultFontSize: 17 }, null);
    const b = createSetState({ defaultFontSize: 18 }, null);
    publishReadingSet('text', a);
    publishReadingSet('text', b);
    expect(publishMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      'reading_set',
      { name: 'web.text', state: b },
      'web.text',
    );
  });

  test("another platform's row is never applied here", async () => {
    useSettingsStore.setState({ settings: {} as SystemSettings });
    const env = {} as EnvConfigType;
    expect(await applyRemoteReadingSet(env, { name: 'android.text', state: state() })).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
    expect(await applyRemoteReadingSet(env, { name: 'web.text', state: state() })).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(env, 'text', expect.any(Function), { publish: false });
  });
});
