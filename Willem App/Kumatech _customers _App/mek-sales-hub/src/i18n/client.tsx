'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LANG, pick, type Lang, type MessageSet } from './core';

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function useMessages<T>(set: MessageSet<T>) {
  return pick(set, useLang());
}
