// src/admin/services/rankingAdminService.js
import {
  adminRunRankingGenerateToday,
  fetchAdminRankingConfig,
  saveAdminRankingConfig,
  adminResetRankingTodayFn,
  adminSeedRankingFakesFn,
} from "./admin.api";

/**
 * ranking_config via Edge Function ADMIN (service role)
 */
export async function fetchRankingConfig() {
  return await fetchAdminRankingConfig();
}

export async function saveRankingConfig(patch) {
  return await saveAdminRankingConfig(patch);
}

/**
 * ✅ Regerar ranking (ADMIN)
 */
export async function runRankingGenerateToday(payload = null) {
  return await adminRunRankingGenerateToday(payload);
}

/**
 * ✅ Reset do dia (ADMIN)
 */
export async function adminResetRankingToday() {
  return await adminResetRankingTodayFn();
}

/**
 * ✅ Seed de fakes (ADMIN)
 */
export async function adminSeedRankingFakes() {
  return await adminSeedRankingFakesFn();
}