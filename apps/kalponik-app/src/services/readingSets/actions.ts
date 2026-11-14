import type { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { ReadingGroup, ReadingSetState } from './model';
import { getOpenBookKeys, getSetState, publishReadingSet, withSetState } from './routing';

// Kalponik: reading-set changes made from the reader or the settings page.

export const applyReaderTheme = (state: ReadingSetState | undefined) => {
  const mode = state?.current.readerThemeMode;
  const color = state?.current.readerThemeColor;
  const theme = useThemeStore.getState();
  if (mode && theme.readerThemeMode !== mode) theme.setScopedThemeMode('reader', mode);
  if (color && theme.readerThemeColor !== color) theme.setScopedThemeColor('reader', color);
};

/**
 * Replaces a whole set (switch slot, pick a preset, revert, rename, ...).
 * Open books of that kind save their progress against the old look first, so
 * the old set's values aren't kept as the book's own, then reopen with the
 * new one where they were.
 */
export const updateReadingSet = async (
  envConfig: EnvConfigType,
  group: ReadingGroup,
  change: (state: ReadingSetState) => ReadingSetState,
): Promise<ReadingSetState> => {
  const { settings, setSettings, saveSettings } = useSettingsStore.getState();
  const before = getSetState(settings, group);
  const after = change(before);
  const lookChanged = JSON.stringify(before.current) !== JSON.stringify(after.current);

  const openKeys = lookChanged ? getOpenBookKeys(group) : [];
  const { getConfig, saveConfig } = useBookDataStore.getState();
  const { getViewState, recreateViewer } = useReaderStore.getState();
  for (const key of openKeys) {
    const config = getConfig(key);
    if (config && getViewState(key)?.isPrimary) await saveConfig(envConfig, key, config, settings);
  }

  const next = withSetState(settings, group, after);
  setSettings(next);
  await saveSettings(envConfig, next);
  if (lookChanged) {
    if (openKeys.length) applyReaderTheme(after);
    for (const key of openKeys) recreateViewer(envConfig, key);
  }
  publishReadingSet(group, after);
  return after;
};
