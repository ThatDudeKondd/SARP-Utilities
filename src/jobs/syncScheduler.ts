import { Client } from "discord.js";
import { syncGuildMembers } from "../services/SyncService.js";
import { logger } from "../utils/logger.js";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/**
 * Runs syncGuildMembers for every guild the bot is in, on a fixed interval.
 * Same logic as the manual /sync command, just without the interaction
 * context or progress embeds -- results just go to the logger.
 */
export function startSyncScheduler(
  client: Client<true>,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  const runSyncForAllGuilds = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const result = await syncGuildMembers(guild);
        logger.info(
          `🔄 Background sync for ${guild.name}: ${result.synced}/${result.total} synced, ${result.failed} failed`,
        );
      } catch (error) {
        logger.error(`Background sync failed for guild ${guild.id}:`, error);
      }
    }
  };

  logger.info(
    `🕒 Background member sync scheduled every ${Math.round(intervalMs / 60000)} minutes`,
  );

  setInterval(runSyncForAllGuilds, intervalMs);
}
