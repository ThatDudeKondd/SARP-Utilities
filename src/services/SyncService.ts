import { Guild } from "discord.js";
import { prisma } from "../database/client.js";
import { logger } from "../utils/logger.js";

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
}

/**
 * Syncs every human member of a guild into the User table (roles + username).
 * Shared by both the manual /sync command and the periodic background job
 * in jobs/syncScheduler.ts, so both stay on the same logic.
 */
export async function syncGuildMembers(
  guild: Guild,
  onProgress?: (result: SyncResult) => void | Promise<void>,
): Promise<SyncResult> {
  const members = await guild.members.fetch(); // full fetch, not cache
  const humanMembers = [...members.values()].filter((m) => !m.user.bot);
  const total = humanMembers.length;

  let synced = 0;
  let failed = 0;

  for (const member of humanMembers) {
    try {
      const roleIds = member.roles.cache
        .filter((role) => role.id !== guild.id) // drop @everyone
        .map((role) => role.id);

      await prisma.user.upsert({
        where: { userId: member.id },
        update: { roles: roleIds, username: member.user.username },
        create: {
          userId: member.id,
          roles: roleIds,
          username: member.user.username,
          guilds: [guild.id],
        },
      });

      synced++;
    } catch (error) {
      failed++;
      logger.error(`Failed to sync member ${member.id}:`, error);
    }

    await onProgress?.({ total, synced, failed });
  }

  return { total, synced, failed };
}
