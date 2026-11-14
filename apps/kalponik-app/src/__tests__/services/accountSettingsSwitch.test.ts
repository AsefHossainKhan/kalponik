// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest';

const reprime = vi.fn();
vi.mock('@/services/sync/replicaSettingsSync', () => ({
  reprimeSettingsSync: (...args: unknown[]) => reprime(...args),
}));

import { reloadAccountSettings } from '@/services/accountSettingsSwitch';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

const BOB = '99999999-8888-4777-8666-555555555555';

describe('switching account loads that account settings', () => {
  test('the store gets the new file, after the sync snapshot is primed with it', async () => {
    useSettingsStore.setState({
      settings: { settingsAccount: 'alice', globalViewSettings: { uiLanguage: 'bn' } } as never,
    });
    const bob = {
      settingsAccount: BOB,
      globalViewSettings: { uiLanguage: 'en', defaultFontSize: 18 },
    } as unknown as SystemSettings;
    const order: string[] = [];
    reprime.mockImplementation(() => order.push('prime'));
    const unsub = useSettingsStore.subscribe(() => order.push('store'));
    const envConfig = {
      getAppService: async () => ({ loadSettings: async () => bob }),
    } as unknown as EnvConfigType;

    await reloadAccountSettings(envConfig);
    unsub();

    expect(useSettingsStore.getState().settings).toBe(bob);
    expect(reprime).toHaveBeenCalledWith(bob);
    expect(order[0]).toBe('prime');
  });
});
