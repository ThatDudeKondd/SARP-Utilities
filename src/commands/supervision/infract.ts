import { prisma } from "../../database/client.js";
import { defineCommand } from "../../utils/defineCommand.js";
import { logger } from "../../utils/logger.js";
import { createInfractionEmbed } from "../../utils/formatters.js";
import { MessageFlags } from "discord.js";

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
    await ctx.message?.delete();

    const infractee = ctx.getUser("user");
    const punishment = ctx.getString("punishment");
    const reason = ctx.getString("reason");

    const infracteeData = await prisma.user.findUnique({
      where: { userId: infractee?.id },
    });

    if (!infractee || !punishment || !reason) {
      return;
    }

    const embed = createInfractionEmbed({
      infractee,
      moderator: ctx.user,
      punishment,
      reason,
    });

    if (ctx.channel?.isSendable()) {
      const reply = await ctx.channel.send({ embeds: [embed] });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await reply.delete();
    }

    logger.info("Infractee Database Data:", infracteeData);
  },
});
