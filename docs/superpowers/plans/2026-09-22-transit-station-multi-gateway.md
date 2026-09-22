# Transit Station Multi-Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Transit Station page into a multi-gateway hub (APIKEY.FUN / OpenRouter / DeepSeek / Custom) with per-provider balance queries, editable model lists, provider icons, provider-aware OpenCode profiles, and generalized Rust profile guards.

**Architecture:** A static provider registry drives the UI; balance parsing moves from inline page code into pure adapter functions dispatched by provider; OpenCode profile ids/names derive from the selected gateway with legacy `apikey-fun` matching preserved; the two Rust guards (sync ownership, removal allow-list) generalize from the hard-coded `apikey-fun` prefix to a managed-prefix list.

**Tech Stack:** React 19 + TypeScript + Vite, tailwind/daisyui classes (existing page style), `@lobehub/icons` (already a dependency), Rust/Axum backend (one file touched).

**Spec:** `docs/superpowers/specs/2026-09-22-transit-station-multi-gateway-design.md`

## Global Constraints

- No new npm or cargo dependencies.
- `node_modules` is not currently installed — run `npm install` once before the first `npm run build`.
- Frontend has no test framework: frontend tasks verify with `npm run build` (tsc + vite). Rust task follows TDD with `cargo test`.
- All new UI strings use `t('apiKeyFun.…', { defaultValue: '…' })` so missing locale keys never break the build; en + zh locale files are updated in Task 6.
- Match the page's existing tailwind + daisyui styling conventions (see `src/pages/ApiKeyFun.tsx`).
- Rust pre-flight for the touched crate: `cargo fmt -- --check`, `cargo clippy --all-targets --all-features`, `cargo check` (run in `src-tauri`).
- Commits follow the repo's conventional style (`feat:`, `refactor:`, `test:`, `i18n:`).

---

### Task 1: Provider registry module

**Files:**
- Create: `src/config/transitProviders.tsx`
- Create: `public/providers/apikeyfun.png` (copy of `docs/images/APIKEYFUN.png`)

**Interfaces:**
- Produces: `TransitProvider`, `BalanceKind`, `TRANSIT_PROVIDERS: TransitProvider[]`, `getProvider(id?: string, userGateways?: TransitProvider[]): TransitProvider`, `inferProviderId(baseUrl: string, userGateways?: TransitProvider[]): string`, `loadUserGateways(): TransitProvider[]`, `saveUserGateways(gateways: TransitProvider[]): void`, `createUserGateway(input: UserGatewayInput): TransitProvider`, `UserGatewayInput` — consumed by Tasks 2, 3, 5.

- [ ] **Step 1: Copy the APIKEY.FUN logo into public assets**

```bash
mkdir -p public/providers && cp docs/images/APIKEYFUN.png public/providers/apikeyfun.png
```

- [ ] **Step 2: Create the registry**

`src/config/transitProviders.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Deepseek, OpenRouter } from '@lobehub/icons';
import { Globe } from 'lucide-react';

export type BalanceKind = 'sub2api-auto' | 'openrouter-credits' | 'deepseek-balance';

export interface TransitProvider {
    id: string;
    name: string;
    baseUrl: string;
    balanceKind: BalanceKind;
    claudeCompatible: boolean;
    /** Anthropic-compatible base URL when it differs from baseUrl. */
    claudeBaseUrl?: string;
    website?: string;
    /** True for user-defined gateway entries (editable/deletable in the picker). */
    userDefined?: boolean;
    icon: ReactNode;
}

export const TRANSIT_PROVIDERS: TransitProvider[] = [
    {
        id: 'apikey-fun',
        name: 'APIKEY.FUN',
        baseUrl: 'https://api.apikey.fan/v1',
        balanceKind: 'sub2api-auto',
        claudeCompatible: true,
        website: 'https://apikey.fan/register?aff=AntManager',
        icon: <img src="/providers/apikeyfun.png" alt="APIKEY.FUN" className="w-5 h-5 rounded" />,
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        balanceKind: 'openrouter-credits',
        claudeCompatible: false,
        website: 'https://openrouter.ai',
        icon: <OpenRouter size={20} />,
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        balanceKind: 'deepseek-balance',
        claudeCompatible: true,
        claudeBaseUrl: 'https://api.deepseek.com/anthropic',
        website: 'https://platform.deepseek.com',
        icon: <Deepseek size={20} />,
    },
    {
        id: 'custom',
        name: 'Custom',
        baseUrl: '',
        balanceKind: 'sub2api-auto',
        claudeCompatible: true,
        icon: <Globe size={18} />,
    },
];

const USER_GATEWAYS_KEY = 'transit_user_gateways_local';
const BALANCE_KINDS: BalanceKind[] = ['sub2api-auto', 'openrouter-credits', 'deepseek-balance'];

export interface UserGatewayInput {
    name: string;
    baseUrl: string;
    balanceKind: BalanceKind;
    claudeCompatible: boolean;
    claudeBaseUrl?: string;
    website?: string;
}

function normalizeBaseUrl(url: string): string {
    return (url || '').trim().toLowerCase().replace(/\/+$/, '');
}

export function loadUserGateways(): TransitProvider[] {
    try {
        const raw = localStorage.getItem(USER_GATEWAYS_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        return list
            .filter((g: any) => typeof g?.id === 'string' && g.id.startsWith('user-') && typeof g?.baseUrl === 'string' && g.baseUrl.trim() !== '')
            .map((g: any): TransitProvider => ({
                id: g.id,
                name: String(g.name || 'Gateway').slice(0, 40),
                baseUrl: g.baseUrl,
                balanceKind: BALANCE_KINDS.includes(g.balanceKind) ? g.balanceKind : 'sub2api-auto',
                claudeCompatible: Boolean(g.claudeCompatible),
                claudeBaseUrl: typeof g.claudeBaseUrl === 'string' && g.claudeBaseUrl.trim() !== '' ? g.claudeBaseUrl : undefined,
                website: typeof g.website === 'string' && g.website.trim() !== '' ? g.website : undefined,
                userDefined: true,
                icon: <Globe size={18} />,
            }));
    } catch {
        return [];
    }
}

export function saveUserGateways(gateways: TransitProvider[]): void {
    localStorage.setItem(USER_GATEWAYS_KEY, JSON.stringify(gateways));
}

export function createUserGateway(input: UserGatewayInput): TransitProvider {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return { id: `user-${hex}`, userDefined: true, icon: <Globe size={18} />, ...input };
}

export function getProvider(id: string | undefined, userGateways: TransitProvider[] = []): TransitProvider {
    return TRANSIT_PROVIDERS.find(p => p.id === id)
        ?? userGateways.find(p => p.id === id)
        ?? TRANSIT_PROVIDERS[TRANSIT_PROVIDERS.length - 1];
}

export function inferProviderId(baseUrl: string, userGateways: TransitProvider[] = []): string {
    const normalized = normalizeBaseUrl(baseUrl);
    const exact = userGateways.find(g => normalizeBaseUrl(g.baseUrl) === normalized && normalized !== '');
    if (exact) return exact.id;
    if (normalized.includes('apikey.fan') || normalized.includes('apikey.fun')) return 'apikey-fun';
    if (normalized.includes('openrouter.ai')) return 'openrouter';
    if (normalized.includes('deepseek.com')) return 'deepseek';
    return 'custom';
}
```

Note: if tsc reports that `OpenRouter` or `Deepseek` is not exported by `@lobehub/icons`, check the actual export names with `node -e "console.log(Object.keys(require('@lobehub/icons')).filter(k => /router|deep/i.test(k)))"` after `npm install` and adjust the import — do not add a new dependency.

- [ ] **Step 3: Type-check**

Run: `npm install` (first time only), then `npm run build`
Expected: tsc passes; vite build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/config/transitProviders.tsx public/providers/apikeyfun.png
git commit -m "feat(transit): add multi-gateway provider registry"
```

---

### Task 2: Balance adapter module

**Files:**
- Create: `src/utils/transitBalance.ts`

**Interfaces:**
- Consumes: `BalanceKind` from Task 1.
- Produces: `UsageSummary` (moved from `ApiKeyFun.tsx`), `fetchBalanceSummary(kind: BalanceKind, endpoint: string, key: string, query: TransitQueryFn): Promise<UsageSummary | null>`, `emptyUsageSummary(): UsageSummary`, type `TransitQueryFn = (url: string, key: string) => Promise<string>` — consumed by Task 5.

- [ ] **Step 1: Create the module**

`src/utils/transitBalance.ts`:

```ts
import type { BalanceKind } from '../config/transitProviders';

export interface UsageSummary {
    remaining: string;
    used: string;
    todayRequests: string;
    todayTokens: string;
    totalRequests: string;
    totalTokens: string;
    unit: string;
    isValid: boolean;
}

export type TransitQueryFn = (url: string, key: string) => Promise<string>;

function money(value: number, unit: string): string {
    return unit === 'USD' ? `$${value.toFixed(2)}` : `${value.toFixed(2)} ${unit}`;
}

/** sub2api-style GET /usage — used by APIKEY.FUN. */
export function parseSub2apiUsage(data: any): UsageSummary | null {
    const remainingRaw = typeof data?.remaining === 'number' ? data.remaining
        : typeof data?.balance === 'number' ? data.balance : null;
    if (remainingRaw === null && data?.quota?.used === undefined && data?.usage?.total === undefined) {
        return null;
    }
    const unit = data?.unit || data?.quota?.unit || 'USD';
    const usedRaw = data?.quota?.used ?? data?.usage?.total?.actual_cost ?? data?.usage?.total?.cost;
    return {
        remaining: remainingRaw !== null ? money(remainingRaw, unit) : '--',
        used: typeof usedRaw === 'number' ? money(usedRaw, unit) : '--',
        todayRequests: String(data?.usage?.today?.requests ?? '--'),
        todayTokens: String(data?.usage?.today?.total_tokens ?? '--'),
        totalRequests: String(data?.usage?.total?.requests ?? '--'),
        totalTokens: String(data?.usage?.total?.total_tokens ?? '--'),
        unit,
        isValid: data?.is_active ?? data?.isValid ?? true,
    };
}

/** One-API / New-API dashboard billing fallback. */
export function parseNewApiDashboard(subData: any, usageData: any): UsageSummary | null {
    if (typeof subData?.hard_limit_usd !== 'number' && typeof usageData?.total_usage !== 'number') {
        return null;
    }
    const totalUsageUSD = (usageData?.total_usage ?? 0) / 100;
    const limitUSD = subData?.hard_limit_usd ?? 0;
    return {
        remaining: `$${(limitUSD - totalUsageUSD).toFixed(4)}`,
        used: `$${totalUsageUSD.toFixed(4)}`,
        todayRequests: '--',
        todayTokens: '--',
        totalRequests: '--',
        totalTokens: '--',
        unit: 'USD',
        isValid: true,
    };
}

/** OpenRouter GET /api/v1/credits — { data: { total_credits, total_usage } } (USD). */
export function parseOpenRouterCredits(data: any): UsageSummary | null {
    const d = data?.data;
    if (typeof d?.total_credits !== 'number' || typeof d?.total_usage !== 'number') {
        return null;
    }
    const remaining = Math.max(0, d.total_credits - d.total_usage);
    return {
        remaining: `$${remaining.toFixed(2)}`,
        used: `$${d.total_usage.toFixed(2)}`,
        todayRequests: '--',
        todayTokens: '--',
        totalRequests: '--',
        totalTokens: '--',
        unit: 'USD',
        isValid: true,
    };
}

/** DeepSeek GET /user/balance — { balance_infos: [{ currency, total_balance, ... }] }. */
export function parseDeepSeekBalance(data: any): UsageSummary | null {
    const infos = Array.isArray(data?.balance_infos) ? data.balance_infos : [];
    const info = infos.find((b: any) => typeof b?.total_balance !== 'undefined'
        && typeof b?.currency === 'string' && b.currency.trim() !== '');
    if (!info) return null;
    const balance = Number(info.total_balance);
    if (!Number.isFinite(balance)) return null;
    const unit = info.currency === 'CNY' ? 'CNY' : 'USD';
    return {
        remaining: money(balance, unit),
        used: '--',
        todayRequests: '--',
        todayTokens: '--',
        totalRequests: '--',
        totalTokens: '--',
        unit,
        isValid: data?.is_available ?? true,
    };
}

export function emptyUsageSummary(): UsageSummary {
    return {
        remaining: '--', used: '--', todayRequests: '--', todayTokens: '--',
        totalRequests: '--', totalTokens: '--', unit: '', isValid: true,
    };
}

/**
 * Fetch and parse a balance summary for the given provider kind. Returns null
 * only when every attempt failed; unrecognized shapes degrade to '--' fields
 * inside a returned summary where partial data exists.
 */
export async function fetchBalanceSummary(
    kind: BalanceKind,
    endpoint: string,
    key: string,
    query: TransitQueryFn,
): Promise<UsageSummary | null> {
    try {
        if (kind === 'openrouter-credits') {
            return parseOpenRouterCredits(JSON.parse(await query(`${endpoint}/credits`, key)));
        }
        if (kind === 'deepseek-balance') {
            return parseDeepSeekBalance(JSON.parse(await query(`${endpoint}/user/balance`, key)));
        }
        // sub2api-auto: sub2api /usage first, then One-API/New-API dashboard billing.
        try {
            const usage = parseSub2apiUsage(JSON.parse(await query(`${endpoint}/usage`, key)));
            if (usage) return usage;
        } catch {
            // fall through to dashboard billing
        }
        const subData = JSON.parse(await query(`${endpoint}/dashboard/billing/subscription`, key));
        const start = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().split('T')[0];
        const end = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
        const usageData = JSON.parse(await query(`${endpoint}/dashboard/billing/usage?start_date=${start}&end_date=${end}`, key));
        return parseNewApiDashboard(subData, usageData);
    } catch {
        return null;
    }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: passes (module not yet imported — no behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/utils/transitBalance.ts
git commit -m "feat(transit): extract per-gateway balance adapters"
```

---

### Task 3: Provider-aware OpenCode profiles

**Files:**
- Modify: `src/utils/opencodeProfiles.ts:115-174` (`getProfileInfo`)

**Interfaces:**
- Consumes: none new.
- Produces: `getProfileInfo(opencodeProviders, keyToCheck, urlToCheck, modelsToCheck?, provider?: { id: string; name: string })` — the optional 5th parameter selects the profile id prefix and display name; omitted, behavior is identical to today (`apikey-fun`). Consumed by Task 5.

- [ ] **Step 1: Extend `getProfileInfo`**

Replace the block from `const suffix = getKeyHashSuffix(trimmedKey);` through `const providerName = \`APIKEY.FUN (${suffix})\`;` (lines 126-132) with:

```ts
    const providerPrefix = provider?.id?.trim() || 'apikey-fun';
    const providerDisplay = provider?.name?.trim() || 'APIKEY.FUN';
    const suffix = getKeyHashSuffix(trimmedKey);
    const shortId = `${providerPrefix}-${suffix}`;
    const fullId = `${providerPrefix}-${sha256Hex(trimmedKey)}`;
    // A 24-bit suffix can collide. Never overwrite a different key's profile.
    const shortProfile = opencodeProviders.find(p => p.id === shortId);
    const providerId = shortProfile && shortProfile.apiKey?.trim() !== trimmedKey ? fullId : shortId;
    const providerName = `${providerDisplay} (${suffix})`;
```

Replace the `existing` lookup (lines 135-137) with — legacy bare-id matching only applies to the APIKEY.FUN provider:

```ts
    const existing = opencodeProviders.find(p => p.id === fullId && p.apiKey?.trim() === trimmedKey)
        ?? opencodeProviders.find(p => p.id === providerId && p.apiKey?.trim() === trimmedKey)
        ?? (providerPrefix === 'apikey-fun'
            ? opencodeProviders.find(p => p.id === 'apikey-fun' && p.apiKey?.trim() === trimmedKey)
            : undefined);
```

Update the function signature (line 115) to:

```ts
export function getProfileInfo(
    opencodeProviders: OpencodeProviderSummary[],
    keyToCheck: string,
    urlToCheck: string,
    modelsToCheck?: string[],
    provider?: { id: string; name: string },
) {
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: passes; existing caller compiles unchanged (new param optional).

- [ ] **Step 3: Commit**

```bash
git add src/utils/opencodeProfiles.ts
git commit -m "feat(transit): provider-aware opencode profile ids and names"
```

---

### Task 4: Generalize Rust profile guards (TDD)

**Files:**
- Modify: `src-tauri/src/proxy/opencode_sync.rs` (guard at ~line 1653, removal gate at ~line 4227, tests near line 2831)
- Test: same file, `#[cfg(test)]` module

**Interfaces:**
- Consumes: existing `APIKEY_FUN_PROVIDER_ID`, `sync_openai_provider_to_path`, `remove_opencode_provider`.
- Produces: private `fn is_transit_managed_provider(provider_id: &str) -> bool` and `const TRANSIT_PROVIDER_PREFIXES: [&str; 5]`. No public signature changes.

- [ ] **Step 1: Write the failing tests**

Add to the tests module (next to `test_profile_collision_leaves_config_unchanged`, ~line 2849):

```rust
    #[test]
    fn test_sync_refuses_to_hijack_profile_of_any_managed_gateway() {
        for (id, second_key) in [
            ("openrouter-abcdef", "second-key"),
            ("deepseek-abcdef", "second-key"),
            ("custom-abcdef", "second-key"),
        ] {
            let tmp = tempfile::tempdir().unwrap();
            let path = tmp.path().join(OPENCODE_CONFIG_FILE);
            let original = format!(
                r#"{{"provider":{{"{id}":{{"options":{{"apiKey":"first-key"}}}}}}}}"#
            );
            fs::write(&path, &original).unwrap();
            let error = sync_openai_provider_to_path(
                &path,
                id,
                "Gateway",
                "https://api.example.com",
                second_key,
                None,
            )
            .unwrap_err();
            assert!(
                error.contains("already belongs to another API key"),
                "guard must protect {id}: got {error}"
            );
            assert_eq!(fs::read_to_string(&path).unwrap(), original);
        }
    }

    #[test]
    fn test_managed_gateway_predicate_matrix() {
        assert!(is_transit_managed_provider("apikey-fun"));
        assert!(is_transit_managed_provider("apikey-fun-abcdef"));
        assert!(is_transit_managed_provider("openrouter-abcdef"));
        assert!(is_transit_managed_provider("deepseek-abcdef"));
        assert!(is_transit_managed_provider("custom-abcdef"));
        assert!(is_transit_managed_provider("user-abcdef"));
        // Bare non-legacy ids and lookalikes stay unmanaged.
        assert!(!is_transit_managed_provider("openrouter"));
        assert!(!is_transit_managed_provider("deepseek"));
        assert!(!is_transit_managed_provider("custom"));
        assert!(!is_transit_managed_provider("user"));
        assert!(!is_transit_managed_provider("openrouterx-abcdef"));
        assert!(!is_transit_managed_provider("username-abcdef"));
        assert!(!is_transit_managed_provider("openai"));
        assert!(!is_transit_managed_provider("anthropic"));
        assert!(!is_transit_managed_provider(""));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --lib opencode_sync`
Expected: FAIL — `test_managed_gateway_predicate_matrix` (function not defined) and `test_sync_refuses_to_hijack_profile_of_any_managed_gateway` (no error returned; guard only checks `apikey-fun-`).

- [ ] **Step 3: Implement**

Near `APIKEY_FUN_PROVIDER_ID` (line ~26) add:

```rust
/// Profile id prefixes owned by the Transit Station feature. Bare ids other
/// than the legacy `apikey-fun` are never app-managed, so user-defined
/// providers with these names stay untouched.
const TRANSIT_PROVIDER_PREFIXES: [&str; 5] = ["apikey-fun", "openrouter", "deepseek", "custom", "user"];

fn is_transit_managed_provider(provider_id: &str) -> bool {
    if provider_id == APIKEY_FUN_PROVIDER_ID {
        return true;
    }
    TRANSIT_PROVIDER_PREFIXES.iter().any(|prefix| {
        provider_id.len() > prefix.len()
            && provider_id.starts_with(prefix)
            && provider_id.as_bytes()[prefix.len()] == b'-'
    })
}
```

In `sync_openai_provider_to_path`, change:

```rust
    if provider_id.starts_with("apikey-fun-") {
```

to:

```rust
    if is_transit_managed_provider(provider_id) {
```

In `remove_opencode_provider` (line ~4227), change:

```rust
    // Only profiles managed by this feature may be removed.
    if provider_id != APIKEY_FUN_PROVIDER_ID
        && !provider_id.starts_with(&format!("{}-", APIKEY_FUN_PROVIDER_ID))
    {
```

to:

```rust
    // Only profiles managed by this feature may be removed.
    if !is_transit_managed_provider(provider_id) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib opencode_sync`
Expected: PASS — all tests including the two new ones and the pre-existing removal test (bare `openrouter` still refused).

- [ ] **Step 5: Rust pre-flight**

Run: `cd src-tauri && cargo fmt -- --check && cargo clippy --all-targets --all-features && cargo check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/proxy/opencode_sync.rs
git commit -m "feat(transit): protect and allow removal of all managed gateway profiles"
```

---

### Task 5: ApiKeyFun page integration

**Files:**
- Modify: `src/pages/ApiKeyFun.tsx`

**Interfaces:**
- Consumes: `TRANSIT_PROVIDERS`, `getProvider`, `inferProviderId` (Task 1); `fetchBalanceSummary`, `emptyUsageSummary`, `UsageSummary`, `TransitQueryFn` (Task 2); provider-aware `getProfileInfo` (Task 3).

- [ ] **Step 1: Imports and type changes**

At the top, add:

```ts
import { TRANSIT_PROVIDERS, getProvider, inferProviderId, loadUserGateways, saveUserGateways, createUserGateway, type TransitProvider, type UserGatewayInput } from '../config/transitProviders';
import { fetchBalanceSummary, emptyUsageSummary, type UsageSummary, type TransitQueryFn } from '../utils/transitBalance';
```

Delete the local `UsageSummary` interface (lines 33-42) and `DEFAULT_ENDPOINT` (line 48); add:

```ts
const DEFAULT_ENDPOINT = 'https://api.apikey.fan/v1'; // keep — legacy fallback for keys saved without baseUrl
const transitQuery: TransitQueryFn = (url, key) => request<string>('query_transit_info', { url, key });
```

Add `providerId?: string;` to `ManagedApiKey` (after `baseUrl: string;`).

- [ ] **Step 2: Gateway state (presets + user-defined)**

After `const [baseUrl, setBaseUrl] = useState(DEFAULT_ENDPOINT);` add:

```ts
    const [providerId, setProviderId] = useState<string>('apikey-fun');
    const [userGateways, setUserGateways] = useState<TransitProvider[]>(() => loadUserGateways());
    const activeProvider = getProvider(providerId, userGateways);

    const persistUserGateways = (next: TransitProvider[]) => {
        setUserGateways(next);
        saveUserGateways(next);
    };

    const handleSelectProvider = (id: string) => {
        setProviderId(id);
        const next = getProvider(id, userGateways);
        if (next.baseUrl) setBaseUrl(next.baseUrl);
    };
```

Every provider lookup in this file passes `userGateways`: `getProvider(providerId, userGateways)`, `getProvider(inferProviderId(endpoint, userGateways), userGateways)`, `getProvider(inferProviderId(item.baseUrl || DEFAULT_ENDPOINT, userGateways), userGateways)`, and inside `profileInfo` / `handleToggleOpenCodeProfile` use `inferProviderId(url, userGateways)` + `getProvider(id, userGateways)`.

- [ ] **Step 3: Replace the balance block in `runQuery`**

First, hoist the provider lookup to function scope — in `runQuery`, right after `const endpoint = urlToQuery.trim().replace(/\/+$/, '');` (line 138), add:

```ts
        const provider = getProvider(inferProviderId(endpoint));
```

Then replace everything from `// 2. Fetch balance (Try sub2api /usage first, then New API billing)` through the closing of the `if (!usageSummary) { … }` fallback block (lines 179-243) with:

```ts
            // 2. Fetch balance via the selected provider's adapter
            let usageSummary = await fetchBalanceSummary(provider.balanceKind, endpoint, key, transitQuery);
            if (!usageSummary && fetchedModels.length > 0) {
                // Models came back, so the key works — degrade balance to '--' instead of failing.
                usageSummary = emptyUsageSummary();
            }
```

In the same function, tag auto-saved/updated keys: in both the `existingIndex >= 0` update and the new-key push, in the success path AND the catch path, add `providerId: provider.id,` next to each `baseUrl: endpoint,` (4 places). `provider` is in scope in the catch block because of the hoist above.

The existing `else { throw new Error(t('apiKeyFun.errors.queryFailed'…)) }` stays as-is: after the degradation above, `usageSummary` is null only when both the models fetch and every balance attempt failed.

- [ ] **Step 4: Selection, initial load, and key clicks**

In the mount effect (line ~326), after `const initialUrl = …`:

```ts
                setProviderId(inferProviderId(initialUrl));
```

In `handleSelectKey` (line ~460), after `setApiKey(item.key);`:

```ts
        setProviderId(inferProviderId(item.baseUrl || DEFAULT_ENDPOINT));
```

- [ ] **Step 5: Claude-aware CLI sync**

In `handleSyncCli` (line ~340), replace the `proxyUrl` computation with:

```ts
        const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
        const baseWithoutV1 = cleanUrl.replace(/\/v1$/i, '');
        const claudeUrl = (activeProvider.claudeBaseUrl || baseUrl).trim().replace(/\/+$/, '');
        const proxyUrl = app === 'Codex' ? `${baseWithoutV1}/v1` : claudeUrl;
```

- [ ] **Step 6: Provider-aware OpenCode profile calls**

Replace the `profileInfo` helper (line ~376):

```ts
    const profileInfo = useCallback((key: string, url: string, modelIds?: string[]) => {
        const id = inferProviderId(url);
        const p = getProvider(id);
        return getProfileInfo(opencodeProviders, key, url, modelIds, { id, name: p.name });
    }, [opencodeProviders]);
```

Inside `handleToggleOpenCodeProfile` (line ~388), change the `getProfileInfo` call to:

```ts
                const providerIdForUrl = inferProviderId(targetUrl);
                const info = getProfileInfo(providers, trimmedKey, targetUrl, keyModels, {
                    id: providerIdForUrl,
                    name: getProvider(providerIdForUrl).name,
                });
```

- [ ] **Step 7: Editable models list**

Add state near the other inputs:

```ts
    const [manualModelInput, setManualModelInput] = useState('');
```

Add helpers (after `getModelsForKey`):

```ts
    const persistModelsForKey = (next: string[]) => {
        const trimmed = apiKey.trim();
        if (!trimmed) return;
        setManagedKeys(prev => prev.map(item =>
            item.key.trim() === trimmed
                ? { ...item, models: next.length > 0 ? next : undefined }
                : item
        ));
    };

    const addManualModel = () => {
        const id = manualModelInput.trim();
        if (!id || models.includes(id)) { setManualModelInput(''); return; }
        const next = [...models, id];
        setModels(next);
        persistModelsForKey(next);
        setManualModelInput('');
    };

    const removeModel = (id: string) => {
        const next = models.filter(m => m !== id);
        setModels(next);
        persistModelsForKey(next);
    };
```

In the models card, make each chip removable and add the input row (replace the chips block, lines ~1014-1020):

```tsx
                            <div className="flex flex-wrap gap-1.5 max-h-[400px] overflow-y-auto pt-2">
                                {models.map(m => (
                                    <span key={m} className="group inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 dark:bg-base-200 text-gray-700 dark:text-gray-300 text-xs rounded-md border border-gray-200 dark:border-base-300 font-mono hover:bg-gray-100 dark:hover:bg-base-300 transition-colors shadow-sm">
                                        {m}
                                        <button
                                            onClick={() => removeModel(m)}
                                            className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                                            title={t('apiKeyFun.models.remove', { defaultValue: 'Remove' })}
                                        >
                                            <X size={11} strokeWidth={2.5} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <input
                                    className="input input-sm flex-1 font-mono text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg focus:border-blue-500 outline-none text-gray-800 dark:text-gray-200 placeholder-slate-400"
                                    placeholder={t('apiKeyFun.models.addPlaceholder', { defaultValue: 'Add model id manually (e.g. deepseek-reasoner)' })}
                                    value={manualModelInput}
                                    onChange={e => setManualModelInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') addManualModel(); }}
                                />
                                <button className="btn btn-sm bg-blue-500 hover:bg-blue-600 text-white border-none rounded-lg" onClick={addManualModel}>
                                    {t('apiKeyFun.models.addButton', { defaultValue: 'Add' })}
                                </button>
                            </div>
```

- [ ] **Step 8: Hybrid gateway selector UI**

Insert immediately after the header card's closing `</div>` (line ~517), before the Stats Grid. `Pencil` and `Trash2` are already imported in the page. Add `Plus` to the lucide-react import.

```tsx
            {/* Gateway Selector */}
            <div className="bg-white dark:bg-base-100 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-base-200">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Layers size={15} className="text-blue-500" />
                    {t('apiKeyFun.gateway.selectLabel', { defaultValue: 'Gateway' })}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[...TRANSIT_PROVIDERS, ...userGateways].map(p => (
                        <div
                            key={p.id}
                            className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                providerId === p.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 ring-2 ring-blue-500/20'
                                    : 'border-gray-200 dark:border-base-300 hover:border-blue-300 dark:hover:border-blue-700 bg-gray-50/50 dark:bg-base-200/50'
                            }`}
                            onClick={() => handleSelectProvider(p.id)}
                        >
                            {p.userDefined && (
                                <span className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                    <button
                                        onClick={e => { e.stopPropagation(); openGatewayEditor(p); }}
                                        className="text-gray-400 hover:text-blue-500 transition-colors"
                                        title={t('apiKeyFun.gateway.editTitle', { defaultValue: 'Edit gateway' })}
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); deleteUserGateway(p.id); }}
                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                        title={t('apiKeyFun.gateway.delete', { defaultValue: 'Delete gateway' })}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </span>
                            )}
                            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-base-100 border border-gray-100 dark:border-base-300 shrink-0">
                                {p.icon}
                            </span>
                            <span className="flex flex-col min-w-0 pr-4">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                    {p.userDefined
                                        ? (p.baseUrl || t('apiKeyFun.gateway.custom.tagline', { defaultValue: 'Any OpenAI-compatible endpoint' }))
                                        : t(`apiKeyFun.gateway.${p.id}.tagline`, { defaultValue: p.baseUrl || 'Any OpenAI-compatible endpoint' })}
                                </span>
                            </span>
                        </div>
                    ))}
                    <button
                        onClick={() => openGatewayEditor(undefined)}
                        className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-gray-300 dark:border-base-300 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all text-sm font-medium"
                    >
                        <Plus size={16} />
                        {t('apiKeyFun.gateway.addTitle', { defaultValue: 'Add gateway' })}
                    </button>
                </div>
            </div>
```

- [ ] **Step 8b: Gateway editor modal**

Add state and handlers (after `handleSelectProvider`):

```ts
    const [gatewayEditorOpen, setGatewayEditorOpen] = useState(false);
    const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);
    const [gatewayForm, setGatewayForm] = useState<UserGatewayInput>({
        name: '', baseUrl: '', balanceKind: 'sub2api-auto', claudeCompatible: true,
    });

    const openGatewayEditor = (provider?: TransitProvider) => {
        setEditingGatewayId(provider?.id ?? null);
        setGatewayForm(provider
            ? {
                name: provider.name,
                baseUrl: provider.baseUrl,
                balanceKind: provider.balanceKind,
                claudeCompatible: provider.claudeCompatible,
                claudeBaseUrl: provider.claudeBaseUrl,
                website: provider.website,
            }
            : { name: '', baseUrl: '', balanceKind: 'sub2api-auto', claudeCompatible: true });
        setGatewayEditorOpen(true);
    };

    const saveGatewayEditor = () => {
        const name = gatewayForm.name.trim();
        const baseUrl = gatewayForm.baseUrl.trim().replace(/\/+$/, '');
        if (!name || !baseUrl) {
            showToast(t('apiKeyFun.gateway.formIncomplete', { defaultValue: 'Name and Base URL are required' }), 'error');
            return;
        }
        if (editingGatewayId) {
            persistUserGateways(userGateways.map(g => g.id === editingGatewayId
                ? { ...g, ...gatewayForm, name, baseUrl }
                : g));
        } else {
            persistUserGateways([...userGateways, createUserGateway({ ...gatewayForm, name, baseUrl })]);
        }
        setGatewayEditorOpen(false);
    };

    const deleteUserGateway = (id: string) => {
        persistUserGateways(userGateways.filter(g => g.id !== id));
        if (providerId === id) handleSelectProvider('custom');
    };
```

Render at the end of the page (before the closing `</motion.div>`):

```tsx
            {gatewayEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setGatewayEditorOpen(false)}>
                    <div className="bg-white dark:bg-base-100 rounded-2xl shadow-xl border border-gray-100 dark:border-base-300 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">
                            {editingGatewayId
                                ? t('apiKeyFun.gateway.editTitle', { defaultValue: 'Edit gateway' })
                                : t('apiKeyFun.gateway.addTitle', { defaultValue: 'Add gateway' })}
                        </h3>
                        <div className="flex flex-col gap-3">
                            <div className="form-control">
                                <label className="label mb-1"><span className="label-text font-bold text-slate-700 dark:text-gray-300">{t('apiKeyFun.gateway.nameLabel', { defaultValue: 'Name' })} <span className="text-red-500">*</span></span></label>
                                <input className="input input-sm w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg" value={gatewayForm.name}
                                    onChange={e => setGatewayForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div className="form-control">
                                <label className="label mb-1"><span className="label-text font-bold text-slate-700 dark:text-gray-300">{t('apiKeyFun.gateway.baseUrlLabel', { defaultValue: 'Base URL' })} <span className="text-red-500">*</span></span></label>
                                <input className="input input-sm w-full font-mono text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg" placeholder="https://api.example.com/v1" value={gatewayForm.baseUrl}
                                    onChange={e => setGatewayForm(f => ({ ...f, baseUrl: e.target.value }))} />
                            </div>
                            <div className="form-control">
                                <label className="label mb-1"><span className="label-text font-bold text-slate-700 dark:text-gray-300">{t('apiKeyFun.gateway.balanceKindLabel', { defaultValue: 'Balance query type' })}</span></label>
                                <select className="select select-sm w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg" value={gatewayForm.balanceKind}
                                    onChange={e => setGatewayForm(f => ({ ...f, balanceKind: e.target.value as UserGatewayInput['balanceKind'] }))}>
                                    <option value="sub2api-auto">{t('apiKeyFun.gateway.balance.sub2api', { defaultValue: 'Auto (relay /usage → dashboard billing)' })}</option>
                                    <option value="openrouter-credits">{t('apiKeyFun.gateway.balance.openrouter', { defaultValue: 'OpenRouter-style /credits' })}</option>
                                    <option value="deepseek-balance">{t('apiKeyFun.gateway.balance.deepseek', { defaultValue: 'DeepSeek-style /user/balance' })}</option>
                                </select>
                            </div>
                            <label className="label cursor-pointer justify-start gap-3 py-1">
                                <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={gatewayForm.claudeCompatible}
                                    onChange={e => setGatewayForm(f => ({ ...f, claudeCompatible: e.target.checked }))} />
                                <span className="label-text text-sm text-slate-700 dark:text-gray-300">{t('apiKeyFun.gateway.claudeCompatLabel', { defaultValue: 'Anthropic-compatible (Claude Code sync)' })}</span>
                            </label>
                            <div className="flex justify-end gap-2 mt-2">
                                <button className="btn btn-sm btn-ghost" onClick={() => setGatewayEditorOpen(false)}>{t('common.cancel') || 'Cancel'}</button>
                                <button className="btn btn-sm bg-blue-500 hover:bg-blue-600 text-white border-none" onClick={saveGatewayEditor}>{t('common.save') || 'Save'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
```

- [ ] **Step 9: Hero rebrand**

Replace the hero title/eyebrow (lines ~496-500) with:

```tsx
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white tracking-wide leading-none">
                                {t('apiKeyFun.hub.title', { defaultValue: 'Gateway Hub' })}
                            </h1>
                            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase">
                                {t('apiKeyFun.hub.eyebrow', { defaultValue: 'Transit Station' })}
                            </span>
```

Replace the description paragraph (lines ~502-504) with:

```tsx
                        <p className="text-xs md:text-sm text-gray-600 dark:text-gray-300/90 leading-relaxed font-normal mt-1">
                            {providerId === 'apikey-fun'
                                ? t('apiKeyFun.description', { defaultValue: 'Antigravity Tools 官方合作中转站，为用户提供稳定、开放、高性价比的大模型 API 接入服务。支持 Claude、OpenAI、Gemini 等主流模型，适合在 Codex、Gemini CLI、Claude Code 及其他开发工具中统一配置使用。通过 Antigravity Tools 专属链接注册，可享受最高充值永久 95 折优惠。' })
                                : t('apiKeyFun.hub.description', { defaultValue: 'Query balance, browse models, and sync any OpenAI-compatible gateway API key into your local CLI tools (Codex, Claude Code, OpenCode).' })}
                        </p>
```

Replace the CTA `<a href="https://apikey.fan/register?aff=AntManager" …>…</a>` (lines ~508-516) with:

```tsx
                {activeProvider.website && (
                    <a
                        href={activeProvider.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white hover:bg-blue-50 dark:bg-base-200 dark:hover:bg-base-300 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-blue-500/10 dark:shadow-none flex-shrink-0 hover:scale-[1.02] active:scale-[0.98] duration-200 z-10"
                    >
                        <ExternalLink size={16} className="text-blue-500 dark:text-blue-400" />
                        <span>{t('apiKeyFun.viewNow', { defaultValue: '立即查看' })}</span>
                    </a>
                )}
```

The APIKEY.FUN aff link lives in the registry (Task 1), so the sponsor link is preserved exactly for that preset.

- [ ] **Step 10: Key manager provider badge + Claude button gating**

In the key list item (near the key name render), add a badge:

```tsx
                                                    <span className="badge badge-ghost badge-xs text-[9px] font-medium py-1">
                                                        {getProvider(inferProviderId(item.baseUrl)).name}
                                                    </span>
```

In the CLI banner, gate Claude: change `const showClaude = !hasModels || hasClaude || (!hasGpt && !hasClaude);` to:

```ts
                                    const showClaude = activeProvider.claudeCompatible && (!hasModels || hasClaude || (!hasGpt && !hasClaude));
```

and directly after the `{showClaude && (…Claude button…)}` block add:

```tsx
                                            {!activeProvider.claudeCompatible && (
                                                <span className="text-[10px] text-base-content/50 font-medium self-center px-2" title={t('apiKeyFun.gateway.claudeUnavailable', { defaultValue: 'No Anthropic-compatible endpoint for this gateway' })}>
                                                    {t('apiKeyFun.gateway.claudeUnavailableShort', { defaultValue: 'Claude Code: N/A' })}
                                                </span>
                                            )}
```

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: tsc + vite pass.

- [ ] **Step 12: Commit**

```bash
git add src/pages/ApiKeyFun.tsx
git commit -m "feat(transit): gateway picker, per-provider balance, editable models"
```

---

### Task 6: Locale strings (en + zh)

**Files:**
- Modify: `src/locales/en.json` (insert into the `apiKeyFun` object at line 1675)
- Modify: `src/locales/zh.json` (insert into the `apiKeyFun` object at line 1641)

**Interfaces:**
- Consumes: the `t()` keys introduced with `defaultValue`s in Task 5.

- [ ] **Step 1: Add keys to `en.json` inside `apiKeyFun`**

```json
    "hub": {
      "title": "Gateway Hub",
      "eyebrow": "Transit Station",
      "description": "Query balance, browse models, and sync any OpenAI-compatible gateway API key into your local CLI tools (Codex, Claude Code, OpenCode)."
    },
    "gateway": {
      "selectLabel": "Gateway",
      "apikey-fun": { "tagline": "Official partner relay with balance dashboard" },
      "openrouter": { "tagline": "Unified access to hundreds of models" },
      "deepseek": { "tagline": "Official DeepSeek API, Claude Code compatible" },
      "custom": { "tagline": "Any OpenAI-compatible endpoint" },
      "addTitle": "Add gateway",
      "editTitle": "Edit gateway",
      "delete": "Delete gateway",
      "nameLabel": "Name",
      "baseUrlLabel": "Base URL",
      "balanceKindLabel": "Balance query type",
      "balance": {
        "sub2api": "Auto (relay /usage → dashboard billing)",
        "openrouter": "OpenRouter-style /credits",
        "deepseek": "DeepSeek-style /user/balance"
      },
      "claudeCompatLabel": "Anthropic-compatible (Claude Code sync)",
      "formIncomplete": "Name and Base URL are required",
      "claudeUnavailable": "This gateway has no Anthropic-compatible endpoint, so Claude Code sync is unavailable.",
      "claudeUnavailableShort": "Claude Code: N/A"
    },
```

- [ ] **Step 2: Add keys to `zh.json` inside `apiKeyFun`**

```json
    "hub": {
      "title": "网关中心",
      "eyebrow": "中转站",
      "description": "查询余额、浏览模型，并将任意 OpenAI 兼容网关的 API Key 一键同步到本地开发工具（Codex、Claude Code、OpenCode）。"
    },
    "gateway": {
      "selectLabel": "网关",
      "apikey-fun": { "tagline": "官方合作中转站，支持余额看板" },
      "openrouter": { "tagline": "聚合数百款模型的统一入口" },
      "deepseek": { "tagline": "DeepSeek 官方 API，兼容 Claude Code" },
      "custom": { "tagline": "任意 OpenAI 兼容接口" },
      "addTitle": "添加网关",
      "editTitle": "编辑网关",
      "delete": "删除网关",
      "nameLabel": "名称",
      "baseUrlLabel": "接口地址",
      "balanceKindLabel": "余额查询方式",
      "balance": {
        "sub2api": "自动（中转 /usage → 计费看板）",
        "openrouter": "OpenRouter 式 /credits",
        "deepseek": "DeepSeek 式 /user/balance"
      },
      "claudeCompatLabel": "兼容 Anthropic 协议（可同步 Claude Code）",
      "formIncomplete": "名称和接口地址为必填项",
      "claudeUnavailable": "该网关没有 Anthropic 兼容端点，无法同步 Claude Code。",
      "claudeUnavailableShort": "Claude Code：不可用"
    },
```

- [ ] **Step 3: Validate JSON + build**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/zh.json','utf8')); console.log('locale JSON OK')"` then `npm run build`
Expected: `locale JSON OK`, build passes.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/zh.json
git commit -m "i18n(transit): gateway hub strings for en and zh"
```

---

### Task 7: Final verification

**Files:** none modified.

- [ ] **Step 1: Full pre-flight**

```bash
cd src-tauri && cargo fmt -- --check && cargo clippy --all-targets --all-features && cargo check
cd .. && npm run build
```

Expected: all clean.

- [ ] **Step 2: Manual smoke checklist (needs the dev app: `npm run tauri dev`)**

- Transit Station shows 4 preset gateway cards with icons (APIKEY.FUN logo, OpenRouter, DeepSeek, Globe) plus user-added gateway cards and the "Add gateway" dashed card.
- Add / edit / delete a user gateway: survives page reload (localStorage `transit_user_gateways_local`); a saved key queried against a user gateway shows its name badge and selects it on click.
- Selecting a preset fills the base URL; editing the URL still works.
- OpenRouter key: model list loads; balance shows `$` remaining or `--` with no error when the key lacks credits permission; Claude Code button replaced by "Claude Code: N/A".
- DeepSeek key: model list loads; balance shows CNY/USD total; Claude sync writes `https://api.deepseek.com/anthropic`.
- APIKEY.FUN key: balance/usage behaves exactly as before (sub2api → dashboard fallback).
- Legacy saved keys appear with an inferred provider badge and still query.
- Models: manual Add (Enter key too) and chip X remove persist after page reload.
- OpenCode sync creates `openrouter-*` / `deepseek-*` / `user-*` profile ids with gateway names; deactivation removes them (Task 4 guards).

- [ ] **Step 3: Report**

Summarize results; note anything from the smoke checklist that needs real keys from the user.
