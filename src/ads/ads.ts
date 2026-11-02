// Rewarded ads (AdMob), only in the iOS / Android apps. A player chooses to watch one at a
// natural break — after a game, when a creature is tired, while a job runs — for a bonus.
// The app never grants the bonus itself: it tags the ad with "reward|ref|nonce", AdMob's signed
// callback reaches our server (Edge Function admob-ssv), and the app waits to see it land.
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { isNative, platform } from '../native/native';

export type AdReward = 'joystick_refill' | 'inkborn_energy' | 'job_rush' | 'game_double' | 'spring_boost';
type AdMobMod = typeof import('@capacitor-community/admob');

const UNIT = {
  android: (import.meta.env.VITE_ADMOB_REWARDED_ANDROID as string) || 'ca-app-pub-3940256099942544/5224354917',
  ios: (import.meta.env.VITE_ADMOB_REWARDED_IOS as string) || 'ca-app-pub-3940256099942544/1712485313',
};
/** Google's public test units never call our server back, so rewards can't arrive with them */
export const TEST_ADS = /^ca-app-pub-3940256099942544\//.test(platform() === 'ios' ? UNIT.ios : UNIT.android);

let mod: AdMobMod | null = null;
let ready: Promise<boolean> | null = null;

/** Start AdMob once: privacy consent (GDPR/US states) and Apple's tracking prompt come first. */
export function initAds() {
  if (!isNative()) return Promise.resolve(false);
  ready ??= (async () => {
    try {
      mod = await import('@capacitor-community/admob');
      const { AdMob } = mod;
      await AdMob.initialize({ initializeForTesting: TEST_ADS });
      try {
        const info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
      } catch { /* consent service unavailable: AdMob serves limited ads */ }
      if (platform() === 'ios') {
        try {
          const t = await AdMob.trackingAuthorizationStatus();
          if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
        } catch { /* older iOS */ }
      }
      return true;
    } catch (e) {
      console.warn('ads unavailable', e);
      return false;
    }
  })();
  return ready;
}

export const adsSupported = () => isNative();

const nonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AdOutcome = { ok: true; result: Record<string, unknown> } | { ok: false; reason: 'unsupported' | 'not_ready' | 'dismissed' | 'pending' | 'error'; message?: string };

/**
 * Show a rewarded ad for `reward` (on `ref`: a creature, game or habitat id) and wait for the
 * server to confirm it. Resolves when the bonus has been granted, or explains why not.
 */
export async function watchRewarded(reward: AdReward, ref = ''): Promise<AdOutcome> {
  if (!isNative()) return { ok: false, reason: 'unsupported' };
  if (!(await initAds()) || !mod) return { ok: false, reason: 'not_ready' };
  const uid = getBackend().session()?.userId;
  if (!uid) return { ok: false, reason: 'error', message: 'Sign in first.' };
  const { AdMob, RewardAdPluginEvents } = mod;
  const n = nonce();
  try {
    await AdMob.prepareRewardVideoAd({
      adId: platform() === 'ios' ? UNIT.ios : UNIT.android,
      isTesting: TEST_ADS,
      ssv: { userId: uid, customData: `${reward}|${ref}|${n}` },
    });
  } catch (e) {
    return { ok: false, reason: 'not_ready', message: 'No ad is available right now — try again in a minute.' };
  }
  let earned = false;
  const sub = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; });
  try {
    await AdMob.showRewardVideoAd();
  } catch (e) {
    void sub.remove();
    return { ok: false, reason: 'error', message: String((e as Error)?.message ?? e) };
  }
  void sub.remove();
  if (!earned) return { ok: false, reason: 'dismissed' };
  // the signed callback usually lands within a few seconds
  for (let i = 0; i < 12; i++) {
    await sleep(i < 4 ? 700 : 1500);
    try {
      const r = await api.myAdReward(n);
      if (r) return { ok: true, result: r.result ?? {} };
    } catch { /* keep waiting */ }
  }
  return { ok: false, reason: 'pending', message: TEST_ADS ? 'Test ads don’t pay out — real ad units are needed for rewards.' : 'Your bonus is on its way — it can take a minute.' };
}
