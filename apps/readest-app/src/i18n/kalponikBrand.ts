import type { PostProcessorModule } from 'i18next';

// Kalponik: show our app name in translated UI text without editing the ~40
// locale files (which would conflict on every upstream merge). Runs on every
// t() result, including untranslated English keys that fall back to the key.
// Only display text changes; internal ids such as the 'readest' sync provider
// kind or storage paths are never passed through t().
const REPLACEMENTS: [RegExp, string][] = [
  [/readest:\/\//g, 'kalponik://'],
  [/Readest/g, 'Kalponik'],
  [/রিডেস্ট/g, 'কাল্পনিক'], // bn
  [/ريديست/g, 'Kalponik'], // ar
];

export const brandText = (value: string): string =>
  REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);

export const kalponikBrand: PostProcessorModule = {
  type: 'postProcessor',
  name: 'kalponikBrand',
  process: (value: string) => (typeof value === 'string' ? brandText(value) : value),
};
