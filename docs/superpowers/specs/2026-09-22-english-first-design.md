# Design: English-First README

**Date:** 2026-09-22
**Status:** Approved (revised scope — language-default change dropped)
**Scope:** Repository README ordering only

## Problem

`README.md` is Chinese-first and the English version lives at `README_EN.md`,
so the repository front page is Chinese for everyone, including English-speaking
visitors. The goal is to make the English readme the project's front page.

## Decision History

The original proposal also changed the first-run UI language default from
OS-locale detection to English. During spec review the user confirmed their OS
is English — the app already runs in English for them — and chose to drop the
language-default change entirely. No application code changes in this design;
the first-run language continues to follow the OS locale.

## Changes

1. `git mv README.md README_CN.md` — Chinese readme, git history preserved.
2. `git mv README_EN.md README.md` — English readme becomes the front page.
3. Fix the language toggle links:
   - `README.md`: `<strong>English</strong> | <a href="./README_CN.md">简体中文</a>`
   - `README_CN.md`: `<strong>简体中文</strong> | <a href="./README.md">English</a>`
4. `scripts/bump-version.mjs`: rename the `README_EN.md` target entry to
   `README_CN.md` (display name and `relPath`; the version replace patterns are
   identical in both files).
5. `docs/RELEASE_GUIDE.md`: update `README_EN.md` mentions to `README_CN.md`.
6. Mentions of `README_EN.md` inside `CHANGELOG.md` / `CHANGELOG_EN.md` are
   historical records and stay unchanged.

## Verification

- `grep -r "README_EN"` returns only the historical changelog mentions.
- Language toggle links in both READMEs resolve to existing files.
- No Rust/frontend code touched, so cargo/CI pre-flight checks are unaffected;
  the only script edit (`bump-version.mjs`) is a two-string rename validated by
  `node --check`.

## Risks

- External links pointing at `README_EN.md` will 404 on GitHub (GitHub does not
  redirect renamed files). Accepted: the canonical front page becomes
  `README.md`.
