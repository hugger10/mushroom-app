import {
  DEFAULT_LIMITS_CONFIG,
  createMushroomApi,
  type LimitsConfig
} from "@mushroom/shared";

// ----- Limits config (mobile cache) -----
let mobileLimitsCache: LimitsConfig | null = null;
let mobileLimitsPromise: Promise<LimitsConfig> | null = null;

export async function ensureMobileLimits(
  api: ReturnType<typeof createMushroomApi>
): Promise<LimitsConfig> {
  if (mobileLimitsCache) return mobileLimitsCache;
  if (!mobileLimitsPromise) {
    mobileLimitsPromise = (async () => {
      try {
        const res = await api.getLimits();
        if (res?.code === 0 && res.data) {
          mobileLimitsCache = res.data as LimitsConfig;
          return mobileLimitsCache;
        }
      } catch {
        /* fall back to defaults */
      }
      mobileLimitsCache = DEFAULT_LIMITS_CONFIG;
      return mobileLimitsCache;
    })();
  }
  return mobileLimitsPromise;
}
