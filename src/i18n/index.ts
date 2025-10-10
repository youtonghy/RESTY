import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['en-US', 'en-GB', 'zh-CN', 'zh-TW'] as const;
const DEFAULT_LANGUAGE = 'en-US';

const LANGUAGE_ALIASES: Record<string, (typeof SUPPORTED_LANGUAGES)[number]> = {
  en: 'en-US',
  'en-us': 'en-US',
  'en-gb': 'en-GB',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
};

export function normalizeLanguage(lang: string): (typeof SUPPORTED_LANGUAGES)[number] {
  const lower = lang.toLowerCase();
  const byAlias = LANGUAGE_ALIASES[lower];
  if (byAlias) {
    return byAlias;
  }
  const direct = SUPPORTED_LANGUAGES.find((code) => code.toLowerCase() === lower);
  return direct ?? DEFAULT_LANGUAGE;
}

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    lng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false,
    },
    resources: {},
  });

// Load language resources dynamically
async function loadLanguageResources(lang: string) {
  const normalized = normalizeLanguage(lang);
  if (i18n.hasResourceBundle(normalized, 'translation')) {
    return normalized;
  }

  try {
    const response = await fetch(`/locales/${normalized}/translation.json`);
    const translations = await response.json();
    i18n.addResourceBundle(normalized, 'translation', translations, true, true);
  } catch (error) {
    console.error(`Failed to load language resources for ${normalized}:`, error);
  }

  return normalized;
}

// Load default language
loadLanguageResources(DEFAULT_LANGUAGE).catch((error) => {
  console.error('Failed to load default language resources:', error);
});

// Change language with resource loading
export async function changeLanguage(lang: string) {
  const normalized = await loadLanguageResources(lang);
  return i18n.changeLanguage(normalized);
}

export { i18n, loadLanguageResources, DEFAULT_LANGUAGE };
export default i18n;
