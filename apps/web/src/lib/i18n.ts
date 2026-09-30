'use client';

/**
 * i18n scaffolding (§3): strings externalized, English default. Uses a tiny
 * dependency-free translator so the bundle stays lean; swap for i18next when
 * translations land (the dictionary shape is i18next-compatible).
 */

type Dict = Record<string, string>;

export const dictionaries: Record<string, Dict> = {
  en: {
    'app.name': 'WorkLink',
    'nav.home': 'Home',
    'nav.search': 'Search',
    'nav.create': 'Create',
    'nav.work': 'My Work',
    'nav.profile': 'Profile',
    'nav.chat': 'Chat',
    'nav.notifications': 'Notifications',
    'feed.nearby': 'Nearby',
    'feed.matched': 'Matched',
    'feed.all': 'All',
    'feed.newPosts': 'New posts',
    'job.apply': 'Apply',
    'job.applied': 'Applied',
    'job.save': 'Save',
    'job.saved': 'Saved',
    'job.share': 'Share',
    'job.report': 'Report',
    'job.chat': 'Chat',
    'auth.login': 'Log in',
    'auth.signup': 'Sign up',
    'auth.logout': 'Log out',
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.kmAway': 'km away',
  },
};

let lang = 'en';

export function setLanguage(l: string) {
  lang = dictionaries[l] ? l : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = /^(ar|he|fa|ur)/.test(l) ? 'rtl' : 'ltr';
  }
}

export function t(key: string, fallback?: string): string {
  return dictionaries[lang]?.[key] ?? dictionaries.en?.[key] ?? fallback ?? key;
}
