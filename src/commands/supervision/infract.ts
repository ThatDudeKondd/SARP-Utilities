import { prisma } from "../../database/client.js";
import { defineCommand } from "../../utils/defineCommand.js";
import { logger } from "../../utils/logger.js";
import { createSuccessEmbed } from "../../utils/formatters.js";

export default defineCommand({
  name: "infract",
  description: "Infracts the given user with the punishment and reason.",
  cooldown: 1000,
  options: [
    {
      name: "user",
      description: "The user to be infracted.",
      type: "user",
      required: true,
    },
    {
      name: "punishment",
      description: "The punishment to be handed out.",
      type: "string",
      required: true,
    },
    {
      name: "reason",
      description: "The reason for the given infraction",
      type: "string",
      required: true,
    },
  ],

  execute: async (ctx) => {
    await ctx.defer();

    const infractee = ctx.getUser("user");
    const punishment = ctx.getString("punishment");
    const reason = ctx.getString("reason");

    const infracteeData = await prisma.user.findUnique({
      where: { userId: infractee?.id },
    });

    const embed = createSuccessEmbed(
      "Infract Command Executed",
      `User: ${infractee?.tag}\nPunishment: ${punishment}\nReason: ${reason}`,
    );

    await ctx.editReply({
      embeds: [embed],
    });

    logger.info("Infractee Database Data:", infracteeData);
  },
});
