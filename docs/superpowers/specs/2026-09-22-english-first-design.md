# Design: English-First Defaults

**Date:** 2026-09-22
**Status:** Approved (pending implementation)
**Scope:** First-run language default + repository README ordering

## Problem

The app currently chooses its first-run UI language from the OS locale
(`src-tauri/src/modules/i18n.rs::default_language()`), falling back to English
only when the OS language is not one of the 12 supported translations. On the
repository side, `README.md` is Chinese-first and the English version lives at
`README_EN.md`. The goal is to make English the primary language of the project:
new installs start in English, and the repository front page is the English
README.

## Goals

1. New installs (fresh config) default to English regardless of OS/browser locale.
2. Existing users keep their saved language; all 12 languages remain switchable
   via the navbar and Settings.
3. `README.md` becomes the English readme; the Chinese readme moves to
   `README_CN.md` with git history preserved.

## Non-Goals

- Forcing English on users who saved another language (no override of saved config).
- Removing or hiding the in-app language switcher.
- Translating or restructuring README content — only file positions and toggle links change.
- A configurable default-language option (YAGNI).

## Part 1 — Default English for New Installs

### Backend: `src-tauri/src/modules/i18n.rs`

- `default_language()` returns `"en".to_string()` unconditionally. Its only
  caller is the config default at `src-tauri/src/models/config.rs:187`.
- Remove the now-dead private helpers `language_from_locales()` and
  `supported_language()` along with their unit tests
  (`detects_supported_languages_from_os_locale_tags`,
  `distinguishes_chinese_scripts_and_regions`,
  `honors_preference_order_and_skips_unsupported_languages`,
  `falls_back_to_english_without_a_supported_locale`).
- Rewrite `tray_uses_the_detected_language` to call `get_tray_texts("ru")`
  directly (it currently goes through the removed helper).
- Tray translation loading (`load_translations`, `get_tray_texts`) is unchanged.

### Backend: `src-tauri/Cargo.toml`

- Drop the `sys-locale = "0.3.2"` dependency — its only use was OS-locale
  detection in `default_language()`.

### Frontend: `src/i18n.ts`

- Initialize i18next with an explicit `lng: "en"` instead of browser detection:
  remove the `i18next-browser-languagedetector` plugin (and its import) and add
  `lng: "en"` to `init()`. The plugin is inert once `lng` is explicit; the saved
  `config.language` applied by `App.tsx` remains the single source of truth.
- Remove `i18next-browser-languagedetector` from `package.json` dependencies —
  `src/i18n.ts` is its only importer.
- Net effect: the window renders in English from the first frame; if the saved
  config says otherwise, `App.tsx` switches once the config loads (same behavior
  as today, minus the browser-locale flash).

### Existing Users / Headless

- No migration: `gui_config.json` keeps its `language` field, `App.tsx`
  continues to apply it, and the tray follows the config language.
- Headless shares the same config default, so the parity requirement in
  AGENTS.md holds without extra work.

## Part 2 — English-First README

1. `git mv README.md README_CN.md` (Chinese version, history preserved).
2. `git mv README_EN.md README.md` (English version becomes the front page).
3. Fix the language toggles:
   - `README.md`: `<strong>English</strong> | <a href="./README_CN.md">简体中文</a>`
   - `README_CN.md`: `<strong>简体中文</strong> | <a href="./README.md">English</a>`
4. `scripts/bump-version.mjs`: rename the `README_EN.md` target entry to
   `README_CN.md` (display name and `relPath`; the version replace patterns are
   identical in both files).
5. `docs/RELEASE_GUIDE.md`: update the `README_EN.md` mention to `README_CN.md`.
6. Mentions of `README_EN.md` inside `CHANGELOG.md` / `CHANGELOG_EN.md` are
   historical records and stay unchanged.

## Verification

- `cd src-tauri && cargo fmt -- --check`
- `cd src-tauri && cargo clippy --all-targets --all-features` (catches the
  removed `sys-locale` usage and dead helpers)
- `cd src-tauri && cargo check`
- `npm run build`
- No Tauri config/Rust build-script change beyond the dependency removal, so
  `npm run tauri build -- --debug --no-bundle` is not required by AGENTS.md;
  run it if the dependency drop causes link changes.

## Risks

- Users who never opened Settings and relied on OS-locale detection will see
  English after upgrading; one navbar click restores their language. Accepted
  by design decision.
- External links on the web pointing at `README_EN.md` will 404 on GitHub;
  GitHub does not redirect renamed files automatically. Accepted (the repo's
  canonical front page becomes `README.md`).
