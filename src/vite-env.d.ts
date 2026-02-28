/// <reference types="vite/client" />

declare global {
  interface Window {
    __rhaiLanguage?: {
      conf: import("monaco-editor").languages.LanguageConfiguration;
      language: import("monaco-editor").languages.IMonarchLanguage;
    };
  }
}

export {};
