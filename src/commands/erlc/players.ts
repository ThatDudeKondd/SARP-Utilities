import { SubCommand } from "../../types/UnifiedCommand.js";
import { prisma } from "../../database/client.js";
import { config } from "../../config/config.js";
import {
  createErrorEmbed,
  createInfoEmbed,
  isPartialMatch,
} from "../../utils/formatters.js";
import { ErlcServerInfo, SUPER_ADMIN_ID } from "../../config/constants.js";
import { logger } from "../../utils/logger.js";
import { MessageFlags } from "discord.js";
import { GuildConfigService } from "../../services/GuildConfigService.js";
import { logCommandError } from "../../middleware/commandLogger.js";

export default {
  name: "players",
  description: "Get a list of players currently in-game.",
  options: [
    {
      name: "username",
      description: "The username of a player to search for.",
      type: "string",
      required: false,
    },
  ],
  execute: async (ctx) => {
    await ctx.defer();

    const indexUsername = ctx.getString("username")?.toLowerCase() || null;

    const guildConfig = await GuildConfigService.getConfig(
      ctx.guild?.id as string,
    );

    const isSuperAdmin = ctx.user.id === SUPER_ADMIN_ID;

    const canRunRoles = [
      ...(guildConfig.directiveRoles || []),
      ...(guildConfig.seniorHrRoles || []),
      ...(guildConfig.managementRoles || []),
      ...(guildConfig.supervisorRoles || []),
      ...(guildConfig.administratorRoles || []),
      ...(guildConfig.moderatorRoles || []),
    ];
    const hasRunPerms =
      isSuperAdmin ||
      ctx.member?.roles?.cache.some((role) => canRunRoles.includes(role.id));

    try {
      const response = await fetch(
        `${config.erlcApiBaseUrl}?Players=true`,
        config.getOptions,
      );
      if (!response.ok) {
        const apiErrEmbed = createErrorEmbed(
          "ERLC API Failed to fetch players",
          `The ERLC API returned a ${response.status} error. Please report this to directive and try again later.`,
        );
        await ctx.editReply({ embeds: [apiErrEmbed] });
        throw new Error(`ERLC API Error returned ${response.status}`);
      }

      const data = (await response.json()) as ErlcServerInfo;
      const players = Array.isArray(data.Players)
        ? data.Players
        : data.Players || [];
      const playerLines = players.slice(0, 25).map((player) => {
        if (!indexUsername) {
          const localPlayer = player.Player ?? "Unknown";
          const playerId = localPlayer.split(":")[1] ?? "";
          const username = localPlayer.split(":")[0] ?? "Unknown";

          const url = config.robloxUserPageUrl.replace("<USER_ID>", playerId);

          return `[${username}](${url}) - ${player.Team}${
            player.Callsign && player.Callsign !== "undefined"
              ? ` - ${player.Callsign}`
              : ""
          }`;
        } else if (isPartialMatch(indexUsername, player.Player.split(":")[0])) {
          const localPlayer = player.Player ?? "Unknown";
          const playerId = localPlayer.split(":")[1] ?? "";
          const username = localPlayer.split(":")[0] ?? "Unknown";

          const url = config.robloxUserPageUrl.replace("<USER_ID>", playerId);

          return `[${username}](${url}) - ${player.Team}${
            player.Callsign && player.Callsign !== "undefined"
              ? ` - ${player.Callsign}`
              : ""
          }`;
        }
      });
      const totalCount = players.length;

      let description = `Total players: ${totalCount} \n\n${playerLines.join("")}`;

      if (playerLines.length === 0) {
        description += "\n\nNo players online.\n\n";
      }

      if (players.length > 25) {
        description += `\n…and ${players.length - 25} more player(s).`;
      }

      const serverName = data.Name || "ERLC Server";
      const embed = createInfoEmbed(serverName, description);
      await ctx.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error(`Failed to fetch players: ${err}`);
      await logCommandError(ctx, "/erlc players", err).catch(() => {});
      const errorEmbed = createErrorEmbed(
        "Failed to fetch and show ERLC players",
        err instanceof Error ? err.message : "An unknown error occured.",
      );
      if (ctx.deferred || ctx.replied) {
        await ctx.editReply({ embeds: [errorEmbed] });
      } else {
        await ctx.reply({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} satisfies SubCommand;
