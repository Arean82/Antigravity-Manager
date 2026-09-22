# Design: Dynamic Gateway Selection in Transit Station

**Date:** 2026-09-22
**Status:** Approved (pending implementation)
**Scope:** Transit Station page (APIKEY.FUN Hub) — multi-gateway support, frontend only

## Problem

The Transit Station page (`src/pages/ApiKeyFun.tsx`) is hardwired to a single
implicit gateway, APIKEY.FUN: one default endpoint, and a balance-query chain
(sub2api `/usage`, then One-API/New-API `/dashboard/billing/*`) that only
APIKEY.FUN-style relays implement. Users of other OpenAI-compatible gateways
(OpenRouter, DeepSeek, custom relays) can paste a different base URL but get no
balance information.

## Goal

Turn the page into a gateway hub: the user picks a gateway from preset choices
(APIKEY.FUN, OpenRouter, DeepSeek, Custom), and base URL, balance query, model
listing, and CLI sync options adapt to the selection.

## Non-Goals

- Proxy upstream routing through these gateways (the proxy's 3rd-party support
  remains the z.ai Anthropic provider).
- A frontend test framework (the repo has none; parsers are kept pure for
  future testing).

## Backend Change (single, small)

`query_transit_info`, `execute_cli_sync`, and `execute_opencode_openai_sync`
are already generic and parameterized — no new commands needed. The one Rust
edit generalizes the key-ownership guard in
`src-tauri/src/proxy/opencode_sync.rs` (~line 1653): today it only protects
provider ids starting with `apikey-fun-` from being overwritten by a different
API key; it must apply to every provider id this app manages
(`openrouter-*`, `deepseek-*`, `custom-*`, `user-*`), otherwise multi-gateway
profiles lose that protection. The removal allow-list (~line 4227) gets the
same generalization via a shared managed-prefix predicate. The guard logic
itself (compare stored `options.apiKey` with the incoming key) is unchanged
and safe to apply universally.

## Provider Registry

New module `src/config/transitProviders.ts`:

```ts
export type BalanceKind = 'sub2api-auto' | 'openrouter-credits' | 'deepseek-balance';

export interface TransitProvider {
    id: string;                // 'apikey-fun' | 'openrouter' | 'deepseek' | 'custom'
    name: string;              // display name
    baseUrl: string;           // default, editable in UI
    balanceKind: BalanceKind;
    claudeCompatible: boolean; // Claude Code sync offered?
    claudeBaseUrl?: string;    // Anthropic-compatible base when it differs
    website?: string;
    tagline?: string;          // one-liner shown on the preset card
}
```

**Provider icons**: each preset renders a brand icon in the selector card and
the key badges. Source: `@lobehub/icons` (already a dependency) for OpenRouter
and DeepSeek; the existing `docs/images/APIKEYFUN.png` asset for APIKEY.FUN;
lucide `Globe` for Custom. No new dependencies.

**User-defined gateways (hybrid registry)**: the picker is not limited to
presets. Users can add their own gateway entries (name, base URL, balance
kind, Claude-compatibility toggle, optional Claude base URL and website),
persisted in localStorage under `transit_user_gateways_local` — the same
storage pattern as the managed keys. Each entry gets an id of the form
`user-<8 hex chars>`. The effective gateway list is presets + user entries;
user cards show edit/delete controls in the picker, and a generic `Globe`
icon. Balance kind choices for user gateways: `sub2api-auto` (default),
`openrouter-credits`, `deepseek-balance`. The Rust managed-prefix list gains
`user` so OpenCode profiles created for user gateways enjoy the same
ownership guard and removable-allow-list as preset gateways.

| Preset | Base URL | Balance | Claude Code |
|---|---|---|---|
| APIKEY.FUN | `https://api.apikey.fan/v1` | `sub2api-auto` (existing chain, unchanged) | yes |
| OpenRouter | `https://openrouter.ai/api/v1` | `openrouter-credits` | no |
| DeepSeek | `https://api.deepseek.com` | `deepseek-balance` | yes, via `https://api.deepseek.com/anthropic` |
| Custom | user-entered | `sub2api-auto` (best-effort auto chain) | yes if it works |

Preset selection fills but never locks the base URL field, so regional mirrors
and self-hosted gateways keep working under a preset's balance adapter.

## UI Changes (`src/pages/ApiKeyFun.tsx`)

1. **Gateway selector** at the top (radio-card row): preset name, tagline,
   balance availability hint. Selecting a preset sets the base URL field
   (always overwrites; the field stays editable afterwards for mirrors).
2. **Key manager**: `ManagedApiKey` gains an optional `providerId?: string`.
   Saved keys render a small provider badge; clicking a key selects its
   gateway. Keys saved before this change have no `providerId`; their provider
   is inferred from the saved base URL (contains `apikey.fan` → APIKEY.FUN
   preset, otherwise `custom`) — no migration, backward compatible.
3. **Claude Code sync button**: rendered only when the active provider is
   `claudeCompatible`; for OpenRouter it is replaced by a hint explaining the
   endpoint is not Anthropic-compatible. When `claudeBaseUrl` differs from
   `baseUrl` (DeepSeek), the sync passes the Claude-specific URL to
   `execute_cli_sync`.
4. **Codex / OpenCode sync**: unchanged behavior, works for all presets
   (commands already accept arbitrary `proxyUrl` + `apiKey`). OpenCode
   profiles become provider-aware: `getProfileInfo` (`src/utils/opencodeProfiles.ts`)
   derives the profile id as `{providerId}-{keyHashSuffix}` (e.g.
   `openrouter-a1b2c3`) and the display name from the selected gateway.
   Legacy matching is kept: existing `apikey-fun-*` (and bare `apikey-fun`)
   profiles whose API key matches still resolve as the same profile, so
   previously synced APIKEY.FUN keys show "Active" instead of duplicating.
5. **Editable models list**: the per-key models list auto-populates from
   `GET {base}/models` after a query (all presets support it). The user can
   additionally add model IDs manually (input + Add) and remove entries
   (per-item remove); manual edits persist in the key's `models` array in
   localStorage. The effective list is fetched ∪ manual (deduped,
   order-stable) and feeds the OpenCode sync. If `/models` fails or returns
   nothing, the user can still populate the list by hand so OpenCode sync is
   not blocked.
6. **Hero rebrand**: title/description generalize from "APIKEY.FUN Hub" to a
   neutral gateway hub; APIKEY.FUN remains the first preset (sponsor
   visibility). Locale strings added to `en` and `zh`; other languages fall
   back to English via `fallbackLng`.

## Balance Adapters

Extract the inline parsing in `runQuery` into pure functions in
`src/utils/transitBalance.ts`, dispatched by `BalanceKind`:

- `sub2api-auto` — existing chain, moved as-is: sub2api `/usage` shape
  (`remaining`/`balance`, `quota.used`, `usage.today/total`), then New-API
  `/dashboard/billing/subscription` + `/usage` (`hard_limit_usd`,
  `total_usage` cents).
- `openrouter-credits` — `GET {base}/credits` → `{ data: { total_credits,
  total_usage } }`; remaining = `total_credits − total_usage`, used =
  `total_usage`, unit USD. OpenRouter keys without the `credits:read`
  permission get 403 → show `--` fields with a hint, not an error state.
- `deepseek-balance` — `GET {base}/user/balance` →
  `{ balance_infos: [{ currency, total_balance, granted_balance,
  topped_up_balance }] }`; remaining = `total_balance` (string → number),
  unit from `currency` (CNY/USD); used = `--` (endpoint reports no spend).

All adapters map into the existing `UsageSummary` shape, so the summary card
renders unchanged. Model listing stays `GET {base}/models` (works for all
presets).

## Data Flow

1. User selects gateway → base URL + balance kind set.
2. Query: `query_transit_info` (unchanged Rust passthrough) hits
   `{base}/models` and the adapter's balance endpoint(s).
3. Adapters return `UsageSummary`; failures degrade to `--` per field.
4. Models auto-populate from the fetch; manual add/remove updates the stored
   per-key list, merged for display and OpenCode sync.
5. CLI sync buttons pass `{ appType, proxyUrl, apiKey }` /
   `{ proxyUrl, apiKey, providerId, providerName, models }` as today.

## Verification

- `npm run build` (tsc + vite) — types and bundling.
- Manual matrix with real keys (user validates): preset select → URL fill,
  balance render per provider, models list, key badge, Codex/OpenCode sync,
  Claude Code button visibility (OpenRouter hidden, DeepSeek uses
  `/anthropic`), legacy keys still queryable.
- Rust guard change → run `cargo fmt -- --check`, `cargo clippy
  --all-targets --all-features`, `cargo check` on the touched crate (CI gates
  these on main/PRs anyway).

## Risks

- Provider balance APIs are third-party surfaces; response shapes may change.
  Mitigation: adapters are narrow, defensive (`--` on missing fields), and
  isolated in one module.
- DeepSeek currency is CNY by default; the summary shows the unit string, no
  conversion attempted.
- Users editing a preset's base URL to a completely different provider keep
  the preset's balance adapter; balance then shows `--` gracefully instead of
  wrong numbers (adapters fail closed on unrecognized shapes).
