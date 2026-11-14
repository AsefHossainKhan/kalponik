import type { ViewSettings } from '@/types/book';
import {
  pickSetValues,
  type ReadingGroup,
  type ReadingPlatform,
  type ReadingSetValues,
} from './model';

// Kalponik: the built-in presets a reader starts from. Each one is a full
// set: the group's fields from the app defaults, then the preset's own values,
// so picking one after another never leaves the previous one's values behind.

export interface ReadingPreset {
  id: string;
  group: ReadingGroup;
  /** English name; the UI passes it through i18n. */
  name: string;
  /** One line under the name in the picker. */
  summary: string;
  values: (platform: ReadingPlatform) => ReadingSetValues;
}

const isPhone = (platform: ReadingPlatform) => platform === 'android' || platform === 'ios';

const margins = (platform: ReadingPlatform, wide: number, narrow: number) => {
  const side = isPhone(platform) ? narrow : wide;
  return { marginLeftPx: side, marginRightPx: side };
};

const LIGHT_OR_SYSTEM: ReadingSetValues = { readerThemeMode: 'auto', readerThemeColor: 'default' };

export const READING_PRESETS: readonly ReadingPreset[] = [
  {
    id: 'comfortable',
    group: 'text',
    name: 'Comfortable',
    summary: 'Serif 18, line 1.6',
    values: (platform) => ({
      defaultFont: 'Serif',
      defaultFontSize: 18,
      fontWeight: 400,
      lineHeight: 1.6,
      paragraphMargin: 0.8,
      letterSpacing: 0,
      wordSpacing: 0,
      fullJustification: true,
      hyphenation: true,
      ...margins(platform, 24, 16),
      maxColumnCount: isPhone(platform) ? 1 : 2,
      scrolled: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'compact',
    group: 'text',
    name: 'Compact',
    summary: 'Sans 15, line 1.3',
    values: (platform) => ({
      defaultFont: 'Sans-serif',
      defaultFontSize: 15,
      fontWeight: 400,
      lineHeight: 1.3,
      paragraphMargin: 0.4,
      letterSpacing: 0,
      wordSpacing: 0,
      fullJustification: true,
      hyphenation: true,
      ...margins(platform, 12, 8),
      maxColumnCount: 2,
      scrolled: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'large-print',
    group: 'text',
    name: 'Large print',
    summary: 'Sans 24, line 1.8',
    values: (platform) => ({
      defaultFont: 'Sans-serif',
      defaultFontSize: 24,
      fontWeight: 500,
      lineHeight: 1.8,
      paragraphMargin: 1,
      letterSpacing: 0.5,
      wordSpacing: 0,
      fullJustification: false,
      hyphenation: false,
      ...margins(platform, 24, 16),
      maxColumnCount: 1,
      scrolled: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'night',
    group: 'text',
    name: 'Night',
    summary: 'Dark, serif 18',
    values: (platform) => ({
      defaultFont: 'Serif',
      defaultFontSize: 18,
      fontWeight: 400,
      lineHeight: 1.7,
      paragraphMargin: 0.8,
      letterSpacing: 0,
      wordSpacing: 0,
      fullJustification: true,
      hyphenation: true,
      ...margins(platform, 24, 16),
      maxColumnCount: isPhone(platform) ? 1 : 2,
      scrolled: false,
      readerThemeMode: 'dark',
      readerThemeColor: 'default',
    }),
  },
  {
    id: 'scroll',
    group: 'text',
    name: 'Scroll',
    summary: 'One column, scrolling',
    values: (platform) => ({
      defaultFont: 'Sans-serif',
      defaultFontSize: 17,
      fontWeight: 400,
      lineHeight: 1.5,
      paragraphMargin: 0.6,
      letterSpacing: 0,
      wordSpacing: 0,
      fullJustification: false,
      hyphenation: true,
      ...margins(platform, 16, 12),
      maxColumnCount: 1,
      maxInlineSize: 720,
      scrolled: true,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'fit-page',
    group: 'fixed',
    name: 'Fit page',
    summary: 'One whole page at a time',
    values: () => ({
      zoomMode: 'fit-page',
      zoomLevel: 100,
      spreadMode: 'none',
      scrolled: false,
      applyThemeToPDF: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'fit-width',
    group: 'fixed',
    name: 'Fit width, scroll',
    summary: 'Continuous scroll, page fills the width',
    values: () => ({
      zoomMode: 'fit-width',
      zoomLevel: 100,
      spreadMode: 'none',
      scrolled: true,
      scrolledDirection: 'vertical',
      applyThemeToPDF: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'two-page',
    group: 'fixed',
    name: 'Two-page spread',
    summary: 'Facing pages, cover alone',
    values: () => ({
      zoomMode: 'fit-page',
      zoomLevel: 100,
      spreadMode: 'auto',
      keepCoverSpread: true,
      scrolled: false,
      applyThemeToPDF: false,
      ...LIGHT_OR_SYSTEM,
    }),
  },
  {
    id: 'night-pdf',
    group: 'fixed',
    name: 'Night PDF',
    summary: 'Dark theme on the pages',
    values: () => ({
      zoomMode: 'fit-width',
      zoomLevel: 100,
      spreadMode: 'none',
      scrolled: true,
      scrolledDirection: 'vertical',
      applyThemeToPDF: true,
      invertImgColorInDark: false,
      readerThemeMode: 'dark',
      readerThemeColor: 'default',
    }),
  },
];

export const DEFAULT_PRESET_ID: Record<ReadingGroup, string> = {
  text: 'comfortable',
  fixed: 'fit-page',
};

export const getPresets = (group: ReadingGroup): ReadingPreset[] =>
  READING_PRESETS.filter((preset) => preset.group === group);

export const getPreset = (id: string | null | undefined): ReadingPreset | undefined =>
  READING_PRESETS.find((preset) => preset.id === id);

/** A preset as a full set: the group's fields from `defaults`, then the preset. */
export const buildPresetValues = (
  preset: ReadingPreset,
  defaults: ViewSettings,
  platform: ReadingPlatform,
): ReadingSetValues => ({
  ...pickSetValues(preset.group, defaults),
  ...preset.values(platform),
});
