import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { applyReaderTheme } from '@/services/readingSets/actions';
import {
  getBookGroup,
  getSetState,
  publishReadingSet,
  withSetValue,
} from '@/services/readingSets/routing';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';

// Kalponik: the reader's light/dark and colour are part of a reading set.
// Opening a book applies its kind's theme; changing the theme while reading
// (with "All books") goes into that set, so PDFs can stay dark while EPUBs
// stay light.
export const useReadingSetTheme = () => {
  const { envConfig } = useEnv();
  const primaryKey = useReaderStore((state) => state.bookKeys[0] ?? '');
  const loaded = useBookDataStore((state) => !!state.getBookData(primaryKey)?.book);

  useEffect(() => {
    if (!primaryKey || !loaded) return;
    const group = getBookGroup(primaryKey);
    if (!group) return;
    applyReaderTheme(useSettingsStore.getState().settings.readingSets?.[group]);

    return useThemeStore.subscribe((theme, prev) => {
      if (
        theme.readerThemeMode === prev.readerThemeMode &&
        theme.readerThemeColor === prev.readerThemeColor
      )
        return;
      if (!(useReaderStore.getState().getViewSettings(primaryKey)?.isGlobal ?? true)) return;
      const { settings, setSettings, saveSettings } = useSettingsStore.getState();
      const current = getSetState(settings, group).current;
      let next = settings;
      if (current.readerThemeMode !== theme.readerThemeMode)
        next = withSetValue(next, group, 'readerThemeMode', theme.readerThemeMode);
      if (current.readerThemeColor !== theme.readerThemeColor)
        next = withSetValue(next, group, 'readerThemeColor', theme.readerThemeColor);
      if (next === settings) return;
      setSettings(next);
      void saveSettings(envConfig, next);
      publishReadingSet(group, next.readingSets![group]!);
    });
  }, [envConfig, primaryKey, loaded]);
};
