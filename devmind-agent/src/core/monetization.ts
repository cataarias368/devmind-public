// ============================================================
// src/core/monetization.ts - Revenue & Commercial Use Detection
// ============================================================

import { ID } from './identity.js';

interface RevenueClaim {
  amount: number;
  source: string;
  timestamp: number;
  claimedBy: string;
}

interface AdInfo {
  type: string;
  content: string;
  plan: string;
}

const revenueLog: RevenueClaim[] = [];

/**
 * Claim revenue from a source.
 */
export function claimRevenue(amount: number, source: string): RevenueClaim {
  const claim: RevenueClaim = {
    amount,
    source,
    timestamp: Date.now(),
    claimedBy: ID.name,
  };

  revenueLog.push(claim);
  console.log(`💰 Revenue claimed: $${amount.toFixed(2)} from "${source}" by ${ID.name}`);

  return claim;
}

/**
 * Detect whether the software is being used commercially.
 * Returns a detection result with details.
 */
export function detectCommercialUse(): { detected: boolean; indicators: string[] } {
  const indicators: string[] = [];

  // Check for commercial environment indicators
  if (process.env.NODE_ENV === 'production') {
    indicators.push('Running in production environment');
  }

  if (process.env.COMMERCIAL_USE === 'true') {
    indicators.push('COMMERCIAL_USE flag is set');
  }

  if (process.env.ENTERPRISE === 'true') {
    indicators.push('ENTERPRISE flag is set');
  }

  const detected = indicators.length > 0;

  if (detected) {
    console.log(`⚠️ Commercial use detected: ${indicators.join(', ')}`);
  } else {
    console.log(`ℹ️ No commercial use indicators detected`);
  }

  return { detected, indicators };
}

/**
 * Get ads configuration for a given plan.
 */
export function getAds(plan: string): AdInfo[] {
  const ads: AdInfo[] = [];

  switch (plan) {
    case 'free':
      ads.push({
        type: 'banner',
        content: 'Upgrade to DevMind Pro for unlimited LLM calls and priority support',
        plan: 'free',
      });
      ads.push({
        type: 'interstitial',
        content: 'DevMind Pro — Advanced AI agent with multi-provider support',
        plan: 'free',
      });
      break;

    case 'pro':
      ads.push({
        type: 'banner',
        content: 'DevMind Enterprise — Team collaboration and custom deployments',
        plan: 'pro',
      });
      break;

    case 'enterprise':
      // No ads for enterprise
      break;

    default:
      ads.push({
        type: 'banner',
        content: 'DevMind Agent — Open-source autonomous software engineering',
        plan: plan,
      });
  }

  if (ads.length > 0) {
    console.log(`📢 Ads served for plan "${plan}": ${ads.length} ad(s)`);
  }

  return ads;
}
