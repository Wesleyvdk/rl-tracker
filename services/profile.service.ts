import { db, getAllAccounts, updateStats } from "./database.service";
import getRanksByTable from "./getRanksByTable.service";
import { ProfileCache } from "./profileCache.service";
export const profileCache = new ProfileCache(db, getRanksByTable);
// Import the last working cache from the old schema without changing links.
for (const account of getAllAccounts()) {
  if (
    !account.stats_json ||
    !account.last_updated ||
    profileCache.read(account.playername, account.platform)
  )
    continue;
  try {
    const tableData = JSON.parse(account.stats_json);
    if (!Array.isArray(tableData) || !tableData.length) continue;
    db.query(
      "INSERT OR IGNORE INTO profile_cache(profile_key,result_json,fetched_at) VALUES (?,?,?)",
    ).run(
      profileCache.key(account.playername, account.platform),
      JSON.stringify({
        tableData,
        parsedRewardLevel: "Reward level unavailable",
      }),
      account.last_updated,
    );
  } catch {}
}
export async function refreshLinkedProfiles() {
  for (const account of getAllAccounts()) {
    const cached = profileCache.read(account.playername, account.platform);
    if (cached && !cached.stale) continue;
    const result = await profileCache.get(
      account.playername,
      account.platform,
      { refresh: true, priority: "background" },
    );
    if (result.tableData && !result.error && !result.stale)
      updateStats(
        account.discord_id,
        JSON.stringify(result.tableData),
        account,
      );
  }
}
