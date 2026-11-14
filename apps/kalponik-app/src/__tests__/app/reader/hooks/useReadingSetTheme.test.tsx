// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));

import { useReadingSetTheme } from '@/app/reader/hooks/useReadingSetTheme';
import { createSetState } from '@/services/readingSets/model';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { SystemSettings } from '@/types/settings';

describe('the reader theme follows the open book kind', () => {
  test('a PDF opens dark from its set, and a theme change while reading goes into that set', () => {
    useThemeStore.getState().setScopedThemeMode('reader', 'light');
    useReaderStore.setState({
      bookKeys: ['pdf1-a'],
      viewStates: { 'pdf1-a': { viewSettings: { isGlobal: true } } },
    } as never);
    useBookDataStore.setState({
      booksData: { pdf1: { id: 'pdf1', book: { format: 'PDF' }, isFixedLayout: true } },
    } as never);
    const saveSettings = vi.fn(async () => {});
    useSettingsStore.setState({
      settings: {
        globalViewSettings: {},
        readingSets: {
          text: createSetState({ readerThemeMode: 'light' }, null),
          fixed: createSetState({ readerThemeMode: 'dark' }, null),
        },
      } as unknown as SystemSettings,
      saveSettings,
    } as never);

    renderHook(() => useReadingSetTheme());
    expect(useThemeStore.getState().readerThemeMode).toBe('dark');

    act(() => useThemeStore.getState().setScopedThemeMode('reader', 'auto'));
    const sets = useSettingsStore.getState().settings.readingSets!;
    expect(sets.fixed!.current.readerThemeMode).toBe('auto');
    expect(sets.text!.current.readerThemeMode).toBe('light');
    expect(saveSettings).toHaveBeenCalled();
  });
});
