import { registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';

/**
 * Hence Pro: what the person owns, and what they can buy.
 *
 * The App Store is the only source of truth (StorePlugin.swift, StoreKit 2,
 * verified on the phone). The last answer is remembered so the app opens
 * already knowing, offline included; StoreKit corrects it within a moment
 * at launch, and again whenever a renewal, a refund or a purchase on another
 * device comes through.
 *
 * The web build has nothing to sell and nothing held back: it counts as Pro.
 */

export const PRODUCTS = {
  yearly: 'com.moussazaghdoud.hence.pro.yearly',
  monthly: 'com.moussazaghdoud.hence.pro.monthly',
  lifetime: 'com.moussazaghdoud.hence.pro.lifetime',
} as const;
const ALL = Object.values(PRODUCTS) as string[];

export interface Period {
  value: number;
  unit: 'day' | 'week' | 'month' | 'year';
}

export interface Offer {
  id: string;
  title: string;
  /** Formatted by the App Store, in the person's currency. */
  price: string;
  kind: 'subscription' | 'lifetime' | 'other';
  period?: Period;
  trial?: Period;
  trialEligible?: boolean;
}

interface StorePlugin {
  products(options: { ids: string[] }): Promise<{ products: Offer[] }>;
  purchase(options: { id: string }): Promise<{ status: 'purchased' | 'pending' | 'cancelled' | 'unverified' | 'unknown'; active?: string[] }>;
  entitlements(): Promise<{ active: string[] }>;
  restore(): Promise<{ active: string[] }>;
  redeem(): Promise<void>;
  addListener(event: 'entitlements', listener: (data: { active: string[] }) => void): Promise<{ remove: () => Promise<void> }>;
}

const Store = registerPlugin<StorePlugin>('Store');

const KEY = 'hence.pro';

function remembered(): boolean {
  if (!isNative()) return true;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let pro = remembered();
const listeners = new Set<() => void>();

function settle(active: string[]): void {
  const next = !isNative() || active.some((id) => ALL.includes(id));
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    /* this session only */
  }
  if (next === pro) return;
  pro = next;
  listeners.forEach((l) => l());
}

export const isPro = (): boolean => pro;

export const usePro = (): boolean =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => pro,
    () => true,
  );

/** At launch: ask StoreKit what is owned, and keep listening. */
export async function initStore(): Promise<void> {
  if (!isNative()) return;
  try {
    await Store.addListener('entitlements', ({ active }) => settle(active));
    settle((await Store.entitlements()).active);
  } catch {
    /* the remembered answer stands */
  }
}

/** The offers, best value first: yearly, monthly, lifetime. Empty when the store cannot say. */
export async function loadOffers(): Promise<Offer[]> {
  if (!isNative()) return [];
  try {
    const { products } = await Store.products({ ids: ALL });
    return ALL.map((id) => products.find((p) => p.id === id)).filter((p): p is Offer => !!p);
  } catch {
    return [];
  }
}

export type BuyResult = 'purchased' | 'pending' | 'cancelled' | 'failed';

export async function buy(id: string): Promise<BuyResult> {
  try {
    const result = await Store.purchase({ id });
    if (result.active) settle(result.active);
    if (result.status === 'purchased') return 'purchased';
    if (result.status === 'pending') return 'pending';
    if (result.status === 'cancelled') return 'cancelled';
    return 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * "Redeem a code": Apple's own sheet for an offer code made in App Store
 * Connect. What it unlocks comes back through the entitlements listener.
 * Resolves false when the sheet could not be shown.
 */
export async function redeemCode(): Promise<boolean> {
  try {
    await Store.redeem();
    return true;
  } catch {
    return false;
  }
}

/** "Restore purchases". Resolves whether Pro was found for this Apple ID. */
export async function restorePurchases(): Promise<boolean | null> {
  try {
    settle((await Store.restore()).active);
    return pro;
  } catch {
    return null;
  }
}
