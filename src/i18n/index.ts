import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as api from '../utils/api';

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

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

export function normalizeLanguage(lang: string): (typeof SUPPORTED_LANGUAGES)[number] {
  const lower = lang.toLowerCase();
  const byAlias = LANGUAGE_ALIASES[lower];
  if (byAlias) {
    return byAlias;
  }
  const direct = SUPPORTED_LANGUAGES.find((code) => code.toLowerCase() === lower);
  return direct ?? DEFAULT_LANGUAGE;
}

const fetchTranslations = async (lang: string, namespace: string) => {
  const normalized = normalizeLanguage(lang);
  if (isTauri) {
    if (namespace !== 'translation') {
      return {};
    }
    return api.loadTranslation(normalized);
  }
  return fetch(`/locales/${normalized}/${namespace}.json`).then((response) => response.json());
};

const backend = {
  type: 'backend' as const,
  read: (language: string, namespace: string, callback: (error: unknown, data: Record<string, unknown> | null) => void) => {
    fetchTranslations(language, namespace)
      .then((resources) => {
        callback(null, resources as Record<string, unknown>);
      })
      .catch((error) => {
        callback(error, null);
      });
  },
};

// Initialize i18n
i18n
  .use(backend)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    lng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
  });

// Load language resources dynamically
async function loadLanguageResources(lang: string, forceReload = false) {
  const normalized = normalizeLanguage(lang);
  if (!forceReload && i18n.hasResourceBundle(normalized, 'translation')) {
    return normalized;
  }

  try {
    const translations = await fetchTranslations(normalized, 'translation');
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
