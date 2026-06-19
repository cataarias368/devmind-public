// ============================================================
// src/core/index.ts — Exportaciones del modulo core
// ============================================================

export { ID, verify, assert, show } from './identity.js';
export { LICENSING, getLicensingInfo, getPlanDetails } from './licensing.js';
export type { LicensePlan } from './licensing.js';
export { getAds, claimRevenue, detectCommercialUse } from './monetization.js';
export type { AdItem, RevenueClaim } from './monetization.js';
