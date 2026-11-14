// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  enableUntouchedRecentShelf,
  migrateBookshelfSettings,
  readBookshelves,
} from '@/services/bookshelves/state';
import { RECENT_BOOKSHELF_ID } from '@/services/bookshelves/definitions';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import { hlcPack } from '@/libs/crdt';
import type { SystemSettings } from '@/types/settings';
import type { BookshelfDefinition } from '@/types/bookshelf';

const recentEnabled = (settings: SystemSettings) =>
  readBookshelves(settings).find((s) => s.id === RECENT_BOOKSHELF_ID)!.enabled;

const migratedWithRecentOff = () => {
  const settings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    libraryRecentShelfEnabled: false,
    replicaDeviceId: 'dev',
  } as SystemSettings;
  migrateBookshelfSettings(settings);
  return settings;
};

describe('Currently reading is on in Kalponik', () => {
  it('is on for a new device', () => {
    expect(recentEnabled({ ...DEFAULT_SYSTEM_SETTINGS } as SystemSettings)).toBe(true);
  });

  it("turns on the off-by-default shelf that Readest's migration froze", () => {
    const settings = migratedWithRecentOff();
    expect(recentEnabled(settings)).toBe(false);
    expect(enableUntouchedRecentShelf(settings)).toBe(true);
    expect(recentEnabled(settings)).toBe(true);
    expect(enableUntouchedRecentShelf(settings)).toBe(false);
  });

  it('leaves a shelf someone turned off themselves', () => {
    const settings = migratedWithRecentOff();
    const row = settings.bookshelves!.rows[RECENT_BOOKSHELF_ID]!;
    const field = row.fields_jsonb['definition']!;
    field.t = hlcPack(1_700_000_000_000, 0, 'dev');
    field.v = { ...(field.v as BookshelfDefinition), enabled: false };
    expect(enableUntouchedRecentShelf(settings)).toBe(false);
    expect(recentEnabled(settings)).toBe(false);
  });
});
