// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { isMobile: false, isDesktopApp: false },
  }),
}));

import ReadingSetStrip from '@/components/settings/ReadingSetStrip';
import { createSetState, pickSetValues } from '@/services/readingSets/model';
import { getDefaultViewSettings } from '@/services/settingsService';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

const defaults = getDefaultViewSettings({ isMobile: false, isEink: false });
const sets = () => useSettingsStore.getState().settings.readingSets!;

beforeEach(() => {
  useSettingsStore.setState({
    settings: {
      globalViewSettings: defaults,
      readingSets: {
        text: createSetState(pickSetValues('text', defaults), 'comfortable'),
        fixed: createSetState(pickSetValues('fixed', defaults), 'fit-page'),
      },
    } as unknown as SystemSettings,
    saveSettings: vi.fn(async () => {}),
  } as never);
});
afterEach(() => cleanup());

describe('reading set strip', () => {
  test('with no book open it names the kind and platform, and saves to an empty slot', async () => {
    const onLookChanged = vi.fn();
    render(<ReadingSetStrip bookKey='' onLookChanged={onLookChanged} />);
    expect(screen.getByText(/Reading set · Text books · Web/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Save here/ })[1]!);
    await waitFor(() => expect(sets().text!.slots[1]?.name).toBe('Comfortable'));
    expect(sets().text!.active).toBe(1);
    // Saving copies the values; nothing on screen changes.
    expect(onLookChanged).not.toHaveBeenCalled();
  });

  test('a preset replaces the values in use and the panels reload', async () => {
    const onLookChanged = vi.fn();
    render(<ReadingSetStrip bookKey='' onLookChanged={onLookChanged} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Start from a preset' }), {
      target: { value: 'large-print' },
    });
    await waitFor(() => expect(sets().text!.current.defaultFontSize).toBe(24));
    expect(sets().text!.basedOn).toBe('large-print');
    expect(onLookChanged).toHaveBeenCalled();
  });

  test('the PDF tab edits the fixed-layout set only', async () => {
    render(<ReadingSetStrip bookKey='' onLookChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByText(/PDF and fixed layout/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Start from a preset' }), {
      target: { value: 'fit-width' },
    });
    await waitFor(() => expect(sets().fixed!.current.zoomMode).toBe('fit-width'));
    expect(sets().text!.basedOn).toBe('comfortable');
  });
});
