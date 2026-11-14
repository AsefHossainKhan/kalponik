import type { Book, ViewSettings } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import { isSameViewSettingValue } from '@/utils/serializer';
import { getReadingGroup, viewPartOf, type ReadingGroup } from './model';

// Kalponik: the look a book is measured against. A book's config keeps only
// what differs from this, so it never copies the reading set's values: change
// the set and every book without its own override follows.

export const getBookBaseViewSettings = (
  settings: SystemSettings,
  book: Pick<Book, 'format'> & { isFixedLayout?: boolean },
  formatDefaults: Partial<ViewSettings> = {},
  group: ReadingGroup = getReadingGroup(book),
): ViewSettings => ({
  ...settings.globalViewSettings,
  ...formatDefaults,
  ...viewPartOf(settings.readingSets?.[group]?.current),
});

/**
 * Moves a book's view settings from one base to another, keeping the book's
 * own overrides: used when an EPUB turns out to be fixed layout on opening.
 */
export const rebaseViewSettings = (
  viewSettings: ViewSettings,
  from: ViewSettings,
  to: ViewSettings,
): ViewSettings => {
  const own: Partial<ViewSettings> = {};
  for (const [key, value] of Object.entries(viewSettings)) {
    const k = key as keyof ViewSettings;
    if (!isSameViewSettingValue(from[k], value)) {
      (own as Record<string, unknown>)[key] = value;
    }
  }
  return { ...to, ...own };
};

const FIXED_ONLY_FIELDS = ['zoomMode', 'zoomLevel', 'spreadMode', 'keepCoverSpread'] as const;

/**
 * What the settings dialog shows with no book open: the text-book set, plus
 * the fixed-layout set's zoom and spread (changes there go to those sets).
 */
export const getLibraryReadingLook = (settings: SystemSettings): ViewSettings => {
  const look: ViewSettings = {
    ...settings.globalViewSettings,
    ...viewPartOf(settings.readingSets?.text?.current),
  };
  const fixed = settings.readingSets?.fixed?.current as Record<string, unknown> | undefined;
  if (fixed) {
    for (const key of FIXED_ONLY_FIELDS) {
      if (fixed[key] !== undefined) (look as unknown as Record<string, unknown>)[key] = fixed[key];
    }
  }
  return look;
};
