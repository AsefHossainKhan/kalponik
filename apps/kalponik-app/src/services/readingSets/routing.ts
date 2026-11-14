import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import type { SystemSettings } from '@/types/settings';
import {
  createSetState,
  getReadingGroup,
  isSetField,
  pickSetValues,
  setCurrentValue,
  type ReadingGroup,
  type ReadingSetState,
} from './model';

// Kalponik: where a reader change goes. Kept free of the theme store and the
// sync code, so the settings helpers can import it cheaply.

/** The kind of book open under `bookKey`, or null when none is. */
export const getBookGroup = (bookKey: string): ReadingGroup | null => {
  if (!bookKey) return null;
  const data = useBookDataStore.getState().getBookData(bookKey);
  if (!data?.book) return null;
  return data.isFixedLayout ? 'fixed' : getReadingGroup(data.book);
};

const FIXED_ONLY = new Set(['zoomMode', 'zoomLevel', 'spreadMode', 'keepCoverSpread']);

/**
 * Which set a change belongs to. With a book open, that book's kind; from
 * the library (no book), zoom and spread go to fixed layout, the rest to
 * text books. Null when the key is app-wide.
 */
export const getChangeGroup = (bookKey: string, key: string): ReadingGroup | null => {
  const group = getBookGroup(bookKey) ?? (FIXED_ONLY.has(key) ? 'fixed' : 'text');
  return isSetField(group, key) ? group : null;
};

/** This account's state for `group`; a first use starts from today's look. */
export const getSetState = (settings: SystemSettings, group: ReadingGroup): ReadingSetState =>
  settings.readingSets?.[group] ??
  createSetState(pickSetValues(group, settings.globalViewSettings ?? {}), null);

export const withSetState = (
  settings: SystemSettings,
  group: ReadingGroup,
  state: ReadingSetState,
): SystemSettings => ({
  ...settings,
  readingSets: { ...settings.readingSets, [group]: state },
});

/** A change made with "All books" in the reader, as new settings. */
export const withSetValue = (
  settings: SystemSettings,
  group: ReadingGroup,
  key: string,
  value: unknown,
): SystemSettings =>
  withSetState(settings, group, setCurrentValue(getSetState(settings, group), key, value));

/** Open book keys of one kind that follow the app-wide look. */
export const getOpenBookKeys = (group: ReadingGroup): string[] => {
  const { bookKeys, getViewSettings } = useReaderStore.getState();
  return bookKeys.filter(
    (key) => getBookGroup(key) === group && (getViewSettings(key)?.isGlobal ?? true),
  );
};

export type SetPublisher = (group: ReadingGroup, state: ReadingSetState) => void;
let publisher: SetPublisher | null = null;
/** The replica sync registers here, so this module needs no sync imports. */
export const setReadingSetPublisher = (next: SetPublisher | null) => {
  publisher = next;
};
export const publishReadingSet = (group: ReadingGroup, state: ReadingSetState) => {
  try {
    publisher?.(group, state);
  } catch (err) {
    console.warn('Failed to publish the reading set', err);
  }
};
