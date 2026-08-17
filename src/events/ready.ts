import { Client, SlashCommandBuilder } from "discord.js";
import { logger } from "../utils/logger.js";
import { CommandLoader } from "../loaders/unifiedCommandLoader.js";
import { GUILD_IDS } from "../config/constants.js";
import { startSyncScheduler } from "../jobs/syncScheduler.js";

export async function onReady(
  client: Client<true>,
  slashData: SlashCommandBuilder[],
) {
  logger.success(`✅ Logged in as ${client.user.tag}`);
  logger.info(`📊 Serving ${client.guilds.cache.size} guilds`);

  await CommandLoader.registerSlashCommands(client, slashData, GUILD_IDS);

  startSyncScheduler(client);
}
