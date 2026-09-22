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
