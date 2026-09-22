import type { ReactNode } from 'react';
import { DeepSeek, OpenRouter } from '@lobehub/icons';
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
        icon: <DeepSeek size={20} />,
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
