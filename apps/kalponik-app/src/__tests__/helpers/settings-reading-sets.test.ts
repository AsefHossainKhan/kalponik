// @vitest-environment happy-dom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { ViewSettings } from '@/types/book';

const EPUB = 'epub1-a';
const PDF = 'pdf1-a';

const viewSettings: Record<string, Partial<ViewSettings>> = {};
const saveConfigMock = vi.fn();

vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({
      bookKeys: [EPUB, PDF],
      getView: () => null,
      getViewState: () => ({ isPrimary: true }),
      getViewSettings: (key: string) => viewSettings[key],
      setViewSettings: (key: string, vs: Partial<ViewSettings>) => {
        viewSettings[key] = vs;
      },
      recreateViewer: vi.fn(),
    }),
  },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({
      getConfig: () => ({}),
      saveConfig: saveConfigMock,
      getBookData: (key: string) =>
        key === EPUB
          ? { book: { format: 'EPUB' }, isFixedLayout: false }
          : { book: { format: 'PDF' }, isFixedLayout: true },
    }),
  },
}));

vi.mock('@/utils/style', () => ({ getStyles: vi.fn(() => '') }));

import { saveViewSettings } from '@/helpers/settings';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

const envConfig = {} as EnvConfigType;

beforeEach(() => {
  viewSettings[EPUB] = { isGlobal: true, defaultFontSize: 16, scrolled: false, uiLanguage: '' };
  viewSettings[PDF] = { isGlobal: true, zoomMode: 'fit-page', scrolled: false, uiLanguage: '' };
  saveConfigMock.mockReset();
  useSettingsStore.setState({
    settings: {
      globalViewSettings: {
        defaultFontSize: 16,
        zoomMode: 'fit-page',
        scrolled: false,
        uiLanguage: '',
      },
    } as unknown as SystemSettings,
    setSettings: (s: SystemSettings) => useSettingsStore.setState({ settings: s }),
    saveSettings: vi.fn(async () => {}),
  } as unknown as ReturnType<typeof useSettingsStore.getState>);
});

const settings = () => useSettingsStore.getState().settings;

describe('a reader change with "All books" goes into that kind of book\'s reading set', () => {
  test('a font size change in an EPUB lands in the text set, not the app-wide look', async () => {
    await saveViewSettings(envConfig, EPUB, 'defaultFontSize', 22);
    expect(settings().readingSets?.text?.current.defaultFontSize).toBe(22);
    expect(settings().globalViewSettings.defaultFontSize).toBe(16);
    expect(viewSettings[EPUB]!.defaultFontSize).toBe(22);
  });

  test('scroll mode in a PDF changes PDFs only, and the open EPUB keeps paging', async () => {
    await saveViewSettings(envConfig, PDF, 'scrolled', true);
    expect(settings().readingSets?.fixed?.current.scrolled).toBe(true);
    expect(settings().readingSets?.text).toBeUndefined();
    expect(viewSettings[PDF]!.scrolled).toBe(true);
    expect(viewSettings[EPUB]!.scrolled).toBe(false);
  });

  test('the book config is measured against the new look, so no override is kept', async () => {
    await saveViewSettings(envConfig, EPUB, 'defaultFontSize', 22);
    const base = saveConfigMock.mock.calls[0]![3] as SystemSettings;
    expect(base.readingSets?.text?.current.defaultFontSize).toBe(22);
  });

  test('an app-wide setting still goes to the app-wide look and every open book', async () => {
    await saveViewSettings(envConfig, EPUB, 'uiLanguage', 'bn');
    expect(settings().globalViewSettings.uiLanguage).toBe('bn');
    expect(settings().readingSets).toBeUndefined();
    expect(viewSettings[PDF]!.uiLanguage).toBe('bn');
  });

  test('"This book only" leaves the sets alone', async () => {
    viewSettings[EPUB]!.isGlobal = false;
    await saveViewSettings(envConfig, EPUB, 'defaultFontSize', 30);
    expect(settings().readingSets).toBeUndefined();
    expect(viewSettings[EPUB]!.defaultFontSize).toBe(30);
  });
});
