import { registerLocale } from './I18n';

export * from './I18n';

// Every JSON file in ./locales is a language; the file name is its code. Importing this module registers them all.
const files = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });
for (const [path, data] of Object.entries(files)) {
  const code = path.replace(/^.*\/(.+)\.json$/, '$1');
  registerLocale(code, data);
}
