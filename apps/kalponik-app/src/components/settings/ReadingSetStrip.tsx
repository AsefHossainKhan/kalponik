import clsx from 'clsx';
import React, { useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getDefaultViewSettings } from '@/services/settingsService';
import { updateReadingSet } from '@/services/readingSets/actions';
import {
  SLOT_NAME_MAX,
  applyPresetValues,
  clearSlot,
  isModified,
  renameSlot,
  revertToSlot,
  saveToSlot,
  switchToSlot,
  type ReadingGroup,
  type SlotIndex,
} from '@/services/readingSets/model';
import { getReadingPlatform } from '@/services/readingSets/platform';
import { buildPresetValues, getPreset, getPresets } from '@/services/readingSets/presets';
import { getBookGroup, getSetState } from '@/services/readingSets/routing';
import { useSettingsStore } from '@/store/settingsStore';

// Kalponik: the reading-set strip at the top of the reading settings. It
// names the kind of book and the platform being edited, switches between
// the three saved sets, starts from a preset, and saves, reverts, renames
// or clears the active set. With no book open it offers both kinds.

interface ReadingSetStripProps {
  bookKey: string;
  /** Called after a change that replaced the values, so panels reload. */
  onLookChanged: () => void;
}

const SLOTS: SlotIndex[] = [0, 1, 2];

const ReadingSetStrip: React.FC<ReadingSetStripProps> = ({ bookKey, onLookChanged }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const settings = useSettingsStore((s) => s.settings);
  const bookGroup = getBookGroup(bookKey);
  const [pickedGroup, setPickedGroup] = useState<ReadingGroup>('text');
  const group = bookGroup ?? pickedGroup;
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!settings.globalViewSettings) return null;
  const state = getSetState(settings, group);
  const active = state.active;
  const activeSlot = active !== null ? state.slots[active] : null;
  const modified = isModified(state);
  const platform = getReadingPlatform();
  const platformLabel =
    platform === 'android' ? _('Android') : platform === 'web' ? _('Web') : _('This device');
  const groupLabel = group === 'text' ? _('Text books') : _('PDF and fixed layout');
  const basedOn = getPreset(state.basedOn);

  const run = async (change: Parameters<typeof updateReadingSet>[2]) => {
    const before = JSON.stringify(getSetState(useSettingsStore.getState().settings, group).current);
    const after = await updateReadingSet(envConfig, group, change);
    if (JSON.stringify(after.current) !== before) onLookChanged();
  };

  const firstEmpty = state.slots.findIndex((slot) => !slot);

  const handleSlot = (index: SlotIndex) => {
    if (state.slots[index]) void run((s) => switchToSlot(s, index));
    else void run((s) => saveToSlot(s, index, basedOn ? _(basedOn.name) : undefined));
  };

  const handlePreset = (id: string) => {
    const preset = getPreset(id);
    if (!preset || !appService) return;
    const defaults = getDefaultViewSettings({
      isMobile: appService.isMobile,
      isDesktopApp: appService.isDesktopApp,
      isEink: !!settings.globalViewSettings.isEink,
    });
    void run((s) => applyPresetValues(s, id, buildPresetValues(preset, defaults, platform)));
  };

  const handleSave = () => {
    const index = active ?? (firstEmpty >= 0 ? (firstEmpty as SlotIndex) : null);
    if (index === null) return;
    void run((s) => saveToSlot(s, index, active === null && basedOn ? _(basedOn.name) : undefined));
  };

  const commitRename = () => {
    if (active !== null && renaming !== null) void run((s) => renameSlot(s, active, renaming));
    setRenaming(null);
  };

  return (
    <section
      aria-label={_('Reading set')}
      className='reading-set-strip bg-base-100 eink-bordered mx-1 mb-3 flex flex-col gap-2 rounded-xl p-3 sm:mx-0'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-col'>
          <span className='text-base-content/70 text-xs'>
            {_('Reading set')} · {groupLabel} · {platformLabel}
          </span>
          <span className='flex items-center gap-2 truncate text-sm font-semibold'>
            {activeSlot?.name ?? (basedOn ? _(basedOn.name) : _('Your settings'))}
            {modified && (
              <span className='badge badge-warning badge-sm font-medium'>{_('Modified')}</span>
            )}
          </span>
        </div>
        {!bookGroup && (
          <div role='group' aria-label={_('Kind of book')} className='join'>
            {(['text', 'fixed'] as const).map((g) => (
              <button
                key={g}
                type='button'
                aria-pressed={group === g}
                className={clsx('btn btn-xs join-item', group === g && 'btn-active')}
                onClick={() => setPickedGroup(g)}
              >
                {g === 'text' ? _('Text books') : _('PDF')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className='grid grid-cols-3 gap-2'>
        {SLOTS.map((index) => {
          const slot = state.slots[index];
          return (
            <button
              key={index}
              type='button'
              aria-pressed={active === index}
              title={slot ? _('Use this set') : _('Save current settings here')}
              className={clsx(
                'btn h-auto min-h-11 flex-col items-start gap-0 px-2 py-1 text-start font-normal normal-case',
                active === index ? 'btn-primary' : slot ? 'btn-outline' : 'btn-ghost border-dashed',
                !slot && 'border-base-content/30 border',
              )}
              onClick={() => handleSlot(index)}
            >
              <span className='text-[11px] opacity-70'>
                {index + 1}
                {active === index ? ` · ${_('in use')}` : ''}
              </span>
              <span className='w-full truncate text-sm'>{slot ? slot.name : _('Save here')}</span>
            </button>
          );
        })}
      </div>

      {renaming !== null ? (
        <div className='flex gap-2'>
          <input
            type='text'
            aria-label={_('Set name')}
            className='input input-sm input-bordered min-w-0 flex-1'
            maxLength={SLOT_NAME_MAX}
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
          <button type='button' className='btn btn-sm btn-primary' onClick={commitRename}>
            {_('Save')}
          </button>
        </div>
      ) : (
        <div className='flex flex-wrap items-center gap-2'>
          <select
            aria-label={_('Start from a preset')}
            className='select select-sm select-bordered min-w-0 flex-1'
            value=''
            onChange={(e) => e.target.value && handlePreset(e.target.value)}
          >
            <option value=''>{_('Presets')}</option>
            {getPresets(group).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {_(preset.name)} · {_(preset.summary)}
              </option>
            ))}
          </select>
          {(modified || active === null) && (active !== null || firstEmpty >= 0) && (
            <button type='button' className='btn btn-sm btn-primary' onClick={handleSave}>
              {active !== null
                ? _('Save to {{name}}', { name: activeSlot?.name ?? '' })
                : _('Save to set {{number}}', { number: firstEmpty + 1 })}
            </button>
          )}
          {modified && (
            <button
              type='button'
              className='btn btn-sm'
              onClick={() => void run((s) => revertToSlot(s))}
            >
              {_('Revert')}
            </button>
          )}
          {activeSlot && (
            <>
              <button
                type='button'
                className='btn btn-sm btn-ghost'
                onClick={() => setRenaming(activeSlot.name)}
              >
                {_('Rename')}
              </button>
              <button
                type='button'
                className='btn btn-sm btn-ghost'
                onClick={() => active !== null && void run((s) => clearSlot(s, active))}
              >
                {_('Clear')}
              </button>
            </>
          )}
        </div>
      )}
      {bookGroup === null && (
        <span className='text-base-content/60 text-xs'>
          {_('Saved to your account for this platform.')}
        </span>
      )}
    </section>
  );
};

export default ReadingSetStrip;
