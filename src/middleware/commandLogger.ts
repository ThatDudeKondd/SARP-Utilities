import { EmbedBuilder } from "discord.js";
import { CommandContext } from "../utils/CommandContext.js";
import { CONSTANTS } from "../config/constants.js";
import { sendToLogsChannel } from "../utils/logChannel.js";

/**
 * Logs a command/interaction execution to the invoking guild's logs
 * channel (set via /server setup or /server configuration). No-ops in
 * DMs, since there's no guild config to look up there.
 */
export async function logCommandExecution(
  ctx: CommandContext,
  commandDisplay: string,
): Promise<void> {
  const guild = ctx.guild;
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setTitle("⚡ Command Executed")
    .addFields(
      { name: "Command", value: `\`${commandDisplay}\``, inline: true },
      {
        name: "User",
        value: `${ctx.user} (\`${ctx.user.id}\`)`,
        inline: true,
      },
      {
        name: "Channel",
        value: ctx.channel ? `<#${ctx.channel.id}>` : "Unknown",
        inline: true,
      },
    )
    .setColor(CONSTANTS.EMBED_COLOR)
    .setTimestamp();

  await sendToLogsChannel(guild, embed);
}
