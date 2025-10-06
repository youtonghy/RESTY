import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const DEFAULT_LANGUAGE = 'en';

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    lng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    resources: {},
  });

// Load language resources dynamically
async function loadLanguageResources(lang: string) {
  try {
    const response = await fetch(`/locales/${lang}/translation.json`);
    const translations = await response.json();
    i18n.addResourceBundle(lang, 'translation', translations);
  } catch (error) {
    console.error(`Failed to load language resources for ${lang}:`, error);
  }
}

// Load default language
loadLanguageResources(DEFAULT_LANGUAGE);

// Change language with resource loading
export async function changeLanguage(lang: string) {
  // Load language resources if not already loaded
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    await loadLanguageResources(lang);
  }
  return i18n.changeLanguage(lang);
}

export { i18n, loadLanguageResources };
export default i18n;
