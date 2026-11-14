import environmentConfig from '@/services/environment';
import { reprimeSettingsSync } from '@/services/sync/replicaSettingsSync';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';

// Kalponik: each account has its own settings file on a device
// (libraryAccount.ts). When a different account signs in, read that file and
// hand it to the store, so its language, reading look, integrations and sync
// cursors replace the previous account's without restarting the app.
export const reloadAccountSettings = async (
  envConfig: EnvConfigType = environmentConfig,
): Promise<void> => {
  try {
    const appService = await envConfig.getAppService();
    const settings = await appService.loadSettings();
    // Prime the publish snapshot first: otherwise the store update below
    // would diff the new file against the old account's values and push it.
    reprimeSettingsSync(settings);
    const store = useSettingsStore.getState();
    store.setSettings(settings);
    store.applyUILanguage(settings.globalViewSettings?.uiLanguage);
  } catch (err) {
    console.warn('Failed to load the signed-in account settings', err);
  }
};
