import { EmbedBuilder, Guild } from "discord.js";
import { GuildConfigService } from "../services/GuildConfigService.js";
import { logger } from "./logger.js";

/**
 * Sends an embed to a guild's configured logs channel (set via
 * /server setup or /server configuration). Silently no-ops if the guild
 * hasn't set one, or if the channel is missing/unsendable -- a logging
 * failure should never break whatever actually triggered the log.
 *
 * Shared by both interactive commands (e.g. /sync) and background jobs
 * (e.g. syncScheduler.ts), so any future background process can reuse
 * the exact same path to the logs channel.
 */
export async function sendToLogsChannel(
  guild: Guild,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const guildConfig = await GuildConfigService.getConfig(guild.id);
    const channelId = guildConfig.logsChannel;
    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel || !channel.isTextBased() || !channel.isSendable()) return;

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error(
      `Failed to send log to logs channel for guild ${guild.id}:`,
      error,
    );
  }
}
