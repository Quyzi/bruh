import * as monaco from "monaco-editor";

const RHAI_LANGUAGE_ID = "rhai";
let registered = false;

/**
 * Registers the Rhai language with Monaco using the definition loaded from
 * public/rhai_syntax_definition.js (exposed on window.__rhaiLanguage).
 * Safe to call multiple times; only registers once.
 */
export function registerRhaiLanguage(): void {
  if (registered) return;

  const mod = window.__rhaiLanguage;
  if (!mod?.conf || !mod?.language) {
    console.warn("Rhai language definition not loaded (window.__rhaiLanguage). Syntax highlighting may be limited.");
    registered = true;
    return;
  }

  monaco.languages.register({ id: RHAI_LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(RHAI_LANGUAGE_ID, mod.conf);
  monaco.languages.setMonarchTokensProvider(RHAI_LANGUAGE_ID, mod.language);
  registered = true;
}

export { RHAI_LANGUAGE_ID };
