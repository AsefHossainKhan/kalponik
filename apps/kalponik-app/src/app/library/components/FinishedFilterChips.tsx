import clsx from 'clsx';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { FINISHED_FILTERS, type FinishedFilter } from '../utils/shelves';

// Kalponik: the chips under the library header: every book, finished books
// hidden, or finished books only. Remembered per device in settings.
export default function FinishedFilterChips() {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const current: FinishedFilter = settings.libraryFinishedFilter ?? 'all';

  const labels: Record<FinishedFilter, string> = {
    all: _('All'),
    hide: _('Hide finished'),
    only: _('Finished only'),
  };

  const choose = (filter: FinishedFilter) => {
    if (filter === current) return;
    const next = { ...useSettingsStore.getState().settings, libraryFinishedFilter: filter };
    setSettings(next);
    void saveSettings(envConfig, next);
  };

  return (
    <div
      role='group'
      aria-label={_('Reading status filter')}
      className='flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 pt-1 sm:px-6'
    >
      {FINISHED_FILTERS.map((filter) => {
        const active = filter === current;
        return (
          <button
            key={filter}
            type='button'
            aria-pressed={active}
            onClick={() => choose(filter)}
            className={clsx(
              'eink-bordered shrink-0 rounded-full border px-3 py-1 text-[13px] leading-5',
              'focus-visible:ring-base-content/20 focus-visible:outline-hidden focus-visible:ring-2',
              'not-eink:transition-colors duration-150',
              active
                ? 'bg-base-content text-base-100 eink:bg-base-content eink:text-base-100 border-transparent font-semibold'
                : 'border-base-content/15 text-base-content/80 hover:bg-base-300/50 bg-transparent',
            )}
          >
            {labels[filter]}
          </button>
        );
      })}
    </div>
  );
}
