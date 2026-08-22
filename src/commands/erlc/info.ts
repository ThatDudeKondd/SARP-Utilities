import { SubCommand } from "../../types/UnifiedCommand.js";
import { config } from "../../config/config.js";
import { logger } from "../../utils/logger.js";
import {
  CONSTANTS,
  ErlcServerInfo,
  RobloxAPIResponse,
} from "../../config/constants.js";
import {
  createErrorEmbed,
  formatFieldsFromObject,
} from "../../utils/formatters.js";
import { EmbedBuilder } from "discord.js";
import { logCommandError } from "../../middleware/commandLogger.js";
import { GuildConfigService } from "../../services/GuildConfigService.js";

export default {
  name: "info",
  description: "Get the in-game server's information",
  execute: async (ctx) => {
    await ctx.defer();

    const guildConfig = await GuildConfigService.getConfig(
      ctx.guild?.id as string,
    );

    const canRunRoles = [
      ...(guildConfig.directiveRoles || []),
      ...(guildConfig.seniorHrRoles || []),
      ...(guildConfig.managementRoles || []),
      ...(guildConfig.supervisorRoles || []),
      ...(guildConfig.administratorRoles || []),
      ...(guildConfig.moderatorRoles || []),
    ];
    const hasRunPerms = ctx.member?.roles?.cache.some((role) =>
      canRunRoles.includes(role.id),
    );

    if (!hasRunPerms) {
      const errorEmbed = createErrorEmbed(
        "You do not have permission to run this command.",
        "This command can only be run by staff members.",
      );
      await ctx.editReply({ embeds: [errorEmbed] });
      return;
    }

    const response = await fetch(`${config.erlcApiBaseUrl}`, config.getOptions);
    if (!response.ok) {
      throw new Error(`ERLC API returned ${response.status}`);
    }
    const data = (await response.json()) as ErlcServerInfo;

    const fetchRobloxUsername = async (userId: number) => {
      try {
        const response = await fetch(
          `https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch Roblox user page for user ID ${userId}`,
          );
        }
        const info = (await response.json()) as RobloxAPIResponse;
        return info.name || "Unknown";
      } catch (error) {
        logger.warn(`Failed to fetch Roblox username for: ${userId}.`, error);
        return "Unknown";
      }
    };

    const makeRobloxProfileLink = async (id: number) => {
      const userId = String(id);
      const username = (await fetchRobloxUsername(id)) || id;
      const profileUrl = config.robloxUserPageUrl.replace("<USER_ID>", userId);
      return `[${username}:${userId}](${profileUrl})`;
    };

    try {
      const cerializedData: any = data;

      if (data.OwnerId) {
        cerializedData.OwnerId = await makeRobloxProfileLink(data.OwnerId);
      }
      if (Array.isArray(data.CoOwnerIds)) {
        cerializedData.CoOwnerIds = (
          await Promise.all(data.CoOwnerIds.map(makeRobloxProfileLink))
        ).join(`\n`);
      } else if (data.CoOwnerIds) {
        cerializedData.CoOwnerIds = await makeRobloxProfileLink(
          data.CoOwnerIds,
        );
      }

      const fields = formatFieldsFromObject(cerializedData);

      const serverName = data.Name || "ERLC Server";
      const embed = new EmbedBuilder()
        .setTitle(serverName)
        .setColor(CONSTANTS.EMBED_COLOR)
        .setTimestamp()
        .setFooter({ text: "ERLC stats" });
      if (fields.length) embed.addFields(fields);
      if (Object.keys(data).length > 25) {
        const jsonBuffer = Buffer.from(JSON.stringify(data, null, 2));
        await ctx.editReply({ embeds: [embed] });
        await ctx.editReply({
          files: [{ attachment: jsonBuffer, name: `erlc-server-stats.json` }],
        });
      } else {
        await ctx.editReply({ embeds: [embed] });
      }
    } catch (err) {
      logger.error("Error fetching ERLC API:", err);
      await logCommandError(ctx, "/erlc info", err).catch(() => {});
      try {
        if (ctx.deferred || ctx.replied) {
          await ctx.editReply({ content: "Failed to fetch ERLC stats." });
        } else {
          await ctx.reply("Failed to fetch ERLC stats.");
        }
      } catch (replyErr) {
        logger.error("Failed to send error reply:", replyErr);
      }
    }
  },
} satisfies SubCommand;
