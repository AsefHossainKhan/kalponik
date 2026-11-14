import type { ViewSettings } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import type { ThemeMode } from '@/styles/themes';
import {
  READING_GROUPS,
  createSetState,
  pickSetValues,
  type ReadingPlatform,
  type ReadingSets,
} from './model';
import { DEFAULT_PRESET_ID, buildPresetValues, getPreset } from './presets';

// Kalponik: the first reading sets an account gets on a device.
//
// The device's first account (the one that kept settings.json) gets today's
// look copied into both kinds of book, so nothing changes on screen after the
// update. Every other account starts from the default presets. A set already
// on the server replaces either when the pull lands.

export interface ReaderTheme {
  mode?: ThemeMode;
  color?: string;
}

export const seedReadingSets = (
  settings: SystemSettings,
  opts: {
    keepCurrentLook: boolean;
    defaults: ViewSettings;
    platform: ReadingPlatform;
    readerTheme?: ReaderTheme;
  },
): boolean => {
  const sets: ReadingSets = { ...settings.readingSets };
  let changed = false;
  for (const group of READING_GROUPS) {
    if (sets[group]) continue;
    if (opts.keepCurrentLook) {
      const look = pickSetValues(group, settings.globalViewSettings);
      if (opts.readerTheme?.mode) look.readerThemeMode = opts.readerTheme.mode;
      if (opts.readerTheme?.color) look.readerThemeColor = opts.readerTheme.color;
      sets[group] = createSetState(look, null);
    } else {
      const preset = getPreset(DEFAULT_PRESET_ID[group])!;
      sets[group] = createSetState(
        buildPresetValues(preset, opts.defaults, opts.platform),
        preset.id,
      );
    }
    changed = true;
  }
  if (changed) settings.readingSets = sets;
  return changed;
};

/** The reader's light/dark and colour as the theme store keeps them. */
export const readStoredReaderTheme = (): ReaderTheme => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const mode = localStorage.getItem('themeMode');
    const color = localStorage.getItem('themeColor');
    return {
      mode: mode === 'auto' || mode === 'light' || mode === 'dark' ? mode : undefined,
      color: color || undefined,
    };
  } catch {
    return {};
  }
};
