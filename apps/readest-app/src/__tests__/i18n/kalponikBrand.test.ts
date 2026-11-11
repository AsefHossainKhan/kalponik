import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { brandText, kalponikBrand } from '@/i18n/kalponikBrand';

describe('kalponikBrand', () => {
  it('renames the app in display text', () => {
    expect(brandText('Sign in to Readest')).toBe('Sign in to Kalponik');
    expect(brandText('App deeplink (readest://)')).toBe('App deeplink (kalponik://)');
    expect(brandText('রিডেস্ট সম্পর্কে')).toBe('কাল্পনিক সম্পর্কে');
    expect(brandText('Nothing to change')).toBe('Nothing to change');
  });

  it('applies to untranslated keys that fall back to the key', async () => {
    const i18n = i18next.createInstance();
    await i18n.use(kalponikBrand).init({
      lng: 'en',
      resources: { en: { translation: {} } },
      keySeparator: false,
      nsSeparator: false,
      postProcess: [kalponikBrand.name],
    });
    expect(i18n.t('About Readest', { defaultValue: 'About Readest' })).toBe('About Kalponik');
  });
});
