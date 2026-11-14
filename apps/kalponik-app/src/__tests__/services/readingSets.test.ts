import { describe, expect, test } from 'vitest';
import {
  SET_FIELDS,
  applyPresetValues,
  clearSlot,
  createSetState,
  getReadingGroup,
  isModified,
  pickSetValues,
  renameSlot,
  resolveViewSettings,
  revertToSlot,
  saveToSlot,
  setCurrentValue,
  switchToSlot,
} from '@/services/readingSets/model';
import {
  DEFAULT_PRESET_ID,
  READING_PRESETS,
  buildPresetValues,
  getPreset,
  getPresets,
} from '@/services/readingSets/presets';
import { getDefaultViewSettings } from '@/services/settingsService';
import type { ViewSettings } from '@/types/book';
import type { FileSystem } from '@/types/system';

const defaults = getDefaultViewSettings({
  fs: {} as FileSystem,
  isMobile: false,
  isEink: false,
  isAppDataSandbox: false,
});

describe('reading set groups', () => {
  test('PDF and CBZ are fixed layout, EPUB is text until it opens as fixed layout', () => {
    expect(getReadingGroup({ format: 'PDF' })).toBe('fixed');
    expect(getReadingGroup({ format: 'CBZ' })).toBe('fixed');
    expect(getReadingGroup({ format: 'EPUB' })).toBe('text');
    expect(getReadingGroup({ format: 'EPUB', isFixedLayout: true })).toBe('fixed');
  });

  test('text sets hold type and spacing, fixed sets hold zoom, neither holds app-wide settings', () => {
    expect(SET_FIELDS.text).toContain('defaultFontSize');
    expect(SET_FIELDS.text).toContain('lineHeight');
    expect(SET_FIELDS.text).not.toContain('zoomMode');
    expect(SET_FIELDS.fixed).toContain('zoomMode');
    expect(SET_FIELDS.fixed).toContain('spreadMode');
    expect(SET_FIELDS.fixed).not.toContain('defaultFontSize');
    for (const group of ['text', 'fixed'] as const) {
      expect(SET_FIELDS[group]).not.toContain('uiLanguage');
      expect(SET_FIELDS[group]).not.toContain('ttsRate');
      expect(SET_FIELDS[group]).not.toContain('isGlobal');
    }
  });

  test('every set field exists in the default view settings', () => {
    for (const group of ['text', 'fixed'] as const) {
      for (const key of SET_FIELDS[group]) expect(defaults).toHaveProperty(key);
    }
  });

  test('a book reads with the app-wide look, then its kind of set', () => {
    const sets = {
      text: createSetState({ defaultFontSize: 22, readerThemeMode: 'dark' }, null),
      fixed: createSetState({ zoomMode: 'fit-width' }, null),
    };
    const epub = resolveViewSettings(defaults, sets, 'text');
    expect(epub.defaultFontSize).toBe(22);
    expect(epub.zoomMode).toBe(defaults.zoomMode);
    expect((epub as unknown as Record<string, unknown>)['readerThemeMode']).toBeUndefined();
    const pdf = resolveViewSettings(defaults, sets, 'fixed');
    expect(pdf.zoomMode).toBe('fit-width');
    expect(pdf.defaultFontSize).toBe(defaults.defaultFontSize);
  });

  test('picking values keeps only the group fields and the reader theme', () => {
    const picked = pickSetValues('fixed', {
      ...defaults,
      readerThemeMode: 'dark',
    } as ViewSettings);
    expect(picked.zoomMode).toBe(defaults.zoomMode);
    expect(picked.readerThemeMode).toBe('dark');
    expect(picked.defaultFontSize).toBeUndefined();
  });
});

describe('slots', () => {
  const start = () => createSetState(pickSetValues('text', defaults), 'comfortable');

  test('a tweak marks the active slot modified; Revert brings the slot back', () => {
    let state = saveToSlot(start(), 1, 'Bedtime');
    expect(state.active).toBe(1);
    expect(isModified(state)).toBe(false);
    state = setCurrentValue(state, 'defaultFontSize', 30);
    expect(isModified(state)).toBe(true);
    expect(state.slots[1]!.values.defaultFontSize).toBe(defaults.defaultFontSize);
    state = revertToSlot(state);
    expect(state.current.defaultFontSize).toBe(defaults.defaultFontSize);
    expect(isModified(state)).toBe(false);
  });

  test('switching slots replaces the values in use', () => {
    let state = saveToSlot(start(), 0, 'Day');
    state = setCurrentValue(state, 'defaultFontSize', 24);
    state = saveToSlot(state, 2, 'Big');
    state = switchToSlot(state, 0);
    expect(state.current.defaultFontSize).toBe(defaults.defaultFontSize);
    expect(state.active).toBe(0);
    state = switchToSlot(state, 2);
    expect(state.current.defaultFontSize).toBe(24);
  });

  test('a saved slot does not change when current changes later', () => {
    let state = saveToSlot(start(), 0, 'Day');
    state = setCurrentValue(state, 'lineHeight', 2);
    expect(state.slots[0]!.values.lineHeight).toBe(defaults.lineHeight);
  });

  test('names are trimmed, capped, and fall back to "Set N"', () => {
    let state = saveToSlot(start(), 0, '   ');
    expect(state.slots[0]!.name).toBe('Set 1');
    state = renameSlot(state, 0, 'x'.repeat(80));
    expect(state.slots[0]!.name).toHaveLength(40);
    state = saveToSlot(state, 0);
    expect(state.slots[0]!.name).toHaveLength(40);
  });

  test('clearing the active slot leaves no slot active', () => {
    let state = saveToSlot(start(), 2, 'Night');
    state = clearSlot(state, 2);
    expect(state.slots[2]).toBeNull();
    expect(state.active).toBeNull();
    expect(switchToSlot(state, 2)).toBe(state);
  });
});

describe('presets', () => {
  test('each group has presets and its default exists', () => {
    expect(getPresets('text').length).toBeGreaterThanOrEqual(4);
    expect(getPresets('fixed').length).toBeGreaterThanOrEqual(3);
    expect(getPreset(DEFAULT_PRESET_ID.text)?.group).toBe('text');
    expect(getPreset(DEFAULT_PRESET_ID.fixed)?.group).toBe('fixed');
  });

  test('preset values only touch their own group fields', () => {
    for (const preset of READING_PRESETS) {
      for (const key of Object.keys(preset.values('web'))) {
        const allowed = [...SET_FIELDS[preset.group], 'readerThemeMode', 'readerThemeColor'];
        expect(allowed, `${preset.id}.${key}`).toContain(key);
      }
    }
  });

  test('picking a preset after another leaves none of the first one behind', () => {
    const large = buildPresetValues(getPreset('large-print')!, defaults, 'web');
    const comfy = buildPresetValues(getPreset('comfortable')!, defaults, 'web');
    let state = createSetState({}, null);
    state = applyPresetValues(state, 'large-print', large);
    state = applyPresetValues(state, 'comfortable', comfy);
    expect(state.current.fontWeight).toBe(400);
    expect(state.current.letterSpacing).toBe(0);
    expect(state.basedOn).toBe('comfortable');
    expect(state.active).toBeNull();
  });

  test('phone presets use narrower margins than the web', () => {
    const web = getPreset('comfortable')!.values('web');
    const phone = getPreset('comfortable')!.values('android');
    expect(phone.marginLeftPx!).toBeLessThan(web.marginLeftPx!);
  });

  test('Night presets switch the reader to dark', () => {
    expect(getPreset('night')!.values('web').readerThemeMode).toBe('dark');
    expect(getPreset('night-pdf')!.values('web').applyThemeToPDF).toBe(true);
  });
});
