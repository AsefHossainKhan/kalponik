import type { Book, ViewSettings } from '@/types/book';
import { FIXED_LAYOUT_FORMATS } from '@/types/book';
import type { ThemeMode } from '@/styles/themes';

// Kalponik: reading sets.
//
// A reading set is the part of the reading look that belongs to one kind of
// book: text books (EPUB, MOBI, FB2, TXT, ...) or fixed-layout books (PDF,
// CBZ, fixed-layout EPUB). Each signed-in account keeps one state per kind on
// each platform: the values in use now (`current`), the preset they started
// from, and three named slots to switch between. Everything else in
// `globalViewSettings` stays app-wide.

export type ReadingGroup = 'text' | 'fixed';
export const READING_GROUPS: readonly ReadingGroup[] = ['text', 'fixed'];

export type ReadingPlatform = 'web' | 'android' | 'desktop' | 'ios';

export type SlotIndex = 0 | 1 | 2;
export const SLOT_COUNT = 3;
export const SLOT_NAME_MAX = 40;

/** The reader's light/dark mode and colour theme ride along with a set. */
export interface ReaderThemeValues {
  readerThemeMode?: ThemeMode;
  readerThemeColor?: string;
}

export type ReadingSetValues = Partial<ViewSettings> & ReaderThemeValues;

export interface ReadingSlot {
  name: string;
  basedOn: string | null;
  values: ReadingSetValues;
}

export interface ReadingSetState {
  current: ReadingSetValues;
  /** The slot `current` was loaded from or last saved to, if any. */
  active: SlotIndex | null;
  basedOn: string | null;
  slots: (ReadingSlot | null)[];
}

export type ReadingSets = Partial<Record<ReadingGroup, ReadingSetState>>;

const TYPE_FIELDS = [
  'defaultFont',
  'serifFont',
  'sansSerifFont',
  'monospaceFont',
  'defaultCJKFont',
  'defaultFontSize',
  'minimumFontSize',
  'fontWeight',
] as const;

const SPACING_FIELDS = [
  'lineHeight',
  'paragraphMargin',
  'wordSpacing',
  'letterSpacing',
  'textIndent',
  'fullJustification',
  'hyphenation',
] as const;

const TEXT_PAGE_FIELDS = [
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
  'gapPercent',
  'maxColumnCount',
  'maxInlineSize',
  'maxBlockSize',
] as const;

const SHARED_FIELDS = [
  'scrolled',
  'animated',
  'pageTurnStyle',
  'showHeader',
  'showFooter',
  'headerFooterFontSize',
] as const;

const TEXT_COLOR_FIELDS = [
  'backgroundTextureId',
  'backgroundOpacity',
  'backgroundSize',
  'overrideFont',
  'overrideLayout',
  'overrideColor',
] as const;

const FIXED_FIELDS = [
  'zoomMode',
  'zoomLevel',
  'spreadMode',
  'keepCoverSpread',
  'scrolledDirection',
  'applyThemeToPDF',
  'invertImgColorInDark',
  'contrast',
] as const;

export type SetViewField = keyof ViewSettings;

/** The view settings each kind of book keeps in its reading set. */
export const SET_FIELDS: Record<ReadingGroup, readonly SetViewField[]> = {
  text: [
    ...TYPE_FIELDS,
    ...SPACING_FIELDS,
    ...TEXT_PAGE_FIELDS,
    ...SHARED_FIELDS,
    ...TEXT_COLOR_FIELDS,
  ],
  fixed: [...FIXED_FIELDS, ...SHARED_FIELDS],
};

export const THEME_FIELDS = ['readerThemeMode', 'readerThemeColor'] as const;

export const isSetField = (group: ReadingGroup, key: string): boolean =>
  (SET_FIELDS[group] as readonly string[]).includes(key);

/**
 * Which kind of book this is. A fixed-layout EPUB is only known once it is
 * opened; the reader then marks the book (`isFixedLayout`) so every later
 * load and save agrees.
 */
export const getReadingGroup = (
  book: Pick<Book, 'format'> & { isFixedLayout?: boolean },
): ReadingGroup => (FIXED_LAYOUT_FORMATS.has(book.format) || book.isFixedLayout ? 'fixed' : 'text');

const clone = <T>(value: T): T =>
  value !== null && typeof value === 'object' ? (JSON.parse(JSON.stringify(value)) as T) : value;

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** The set fields (and reader theme) of `source`, nothing else. */
export const pickSetValues = (
  group: ReadingGroup,
  source: Partial<ViewSettings> & ReaderThemeValues,
): ReadingSetValues => {
  const out: Record<string, unknown> = {};
  for (const key of [...SET_FIELDS[group], ...THEME_FIELDS]) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = clone(value);
  }
  return out as ReadingSetValues;
};

/** Only the view-setting part of a set (the reader theme is applied apart). */
export const viewPartOf = (values: ReadingSetValues | undefined): Partial<ViewSettings> => {
  if (!values) return {};
  const { readerThemeMode: _mode, readerThemeColor: _color, ...view } = values;
  return view;
};

export const emptySlots = (): (ReadingSlot | null)[] => [null, null, null];

export const createSetState = (
  current: ReadingSetValues,
  basedOn: string | null,
): ReadingSetState => ({
  current: clone(current),
  active: null,
  basedOn,
  slots: emptySlots(),
});

/** True when `current` no longer matches the active slot. */
export const isModified = (state: ReadingSetState): boolean => {
  if (state.active === null) return false;
  const slot = state.slots[state.active];
  if (!slot) return false;
  for (const [key, value] of Object.entries(slot.values)) {
    const now = (state.current as Record<string, unknown>)[key];
    if (now !== undefined && !sameValue(value, now)) return true;
  }
  return false;
};

/** A change made in the reader with "All books": it goes into `current`. */
export const setCurrentValue = (
  state: ReadingSetState,
  key: string,
  value: unknown,
): ReadingSetState => ({
  ...state,
  current: { ...state.current, [key]: clone(value) },
});

export const applyPresetValues = (
  state: ReadingSetState,
  presetId: string,
  values: ReadingSetValues,
): ReadingSetState => ({
  ...state,
  current: { ...state.current, ...clone(values) },
  basedOn: presetId,
  active: null,
});

export const cleanSlotName = (name: string, index: SlotIndex): string =>
  name.trim().slice(0, SLOT_NAME_MAX) || `Set ${index + 1}`;

export const saveToSlot = (
  state: ReadingSetState,
  index: SlotIndex,
  name?: string,
): ReadingSetState => {
  const slots = [...state.slots];
  while (slots.length < SLOT_COUNT) slots.push(null);
  const previous = slots[index];
  slots[index] = {
    name: cleanSlotName(name ?? previous?.name ?? '', index),
    basedOn: state.basedOn,
    values: clone(state.current),
  };
  return { ...state, slots, active: index };
};

export const switchToSlot = (state: ReadingSetState, index: SlotIndex): ReadingSetState => {
  const slot = state.slots[index];
  if (!slot) return state;
  return {
    ...state,
    current: { ...state.current, ...clone(slot.values) },
    basedOn: slot.basedOn,
    active: index,
  };
};

/** Back to the active slot's values. */
export const revertToSlot = (state: ReadingSetState): ReadingSetState =>
  state.active === null ? state : switchToSlot(state, state.active);

export const renameSlot = (
  state: ReadingSetState,
  index: SlotIndex,
  name: string,
): ReadingSetState => {
  const slot = state.slots[index];
  if (!slot) return state;
  const slots = [...state.slots];
  slots[index] = { ...slot, name: cleanSlotName(name, index) };
  return { ...state, slots };
};

export const clearSlot = (state: ReadingSetState, index: SlotIndex): ReadingSetState => {
  const slots = [...state.slots];
  slots[index] = null;
  return { ...state, slots, active: state.active === index ? null : state.active };
};

/** The values a book of `group` reads with: app-wide settings, then the set. */
export const resolveViewSettings = (
  global: ViewSettings,
  sets: ReadingSets | undefined,
  group: ReadingGroup,
): ViewSettings => ({ ...global, ...viewPartOf(sets?.[group]?.current) });
