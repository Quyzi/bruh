/// <reference types="vite/client" />

declare const __BRUH_VERSION__: string;

declare global {
  interface Window {
    __rhaiLanguage?: {
      conf: import("monaco-editor").languages.LanguageConfiguration;
      language: import("monaco-editor").languages.IMonarchLanguage;
    };
  }
}

export {};
