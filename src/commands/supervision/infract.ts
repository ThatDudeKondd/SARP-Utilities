import { prisma } from "../../database/client.js";
import { defineCommand } from "../../utils/defineCommand.js";
import { logger } from "../../utils/logger.js";
import {
  createInfractionEmbed,
  createSuccessEmbed,
} from "../../utils/formatters.js";

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

    const guildData = await prisma.guildConfig.findUnique({
      where: { guildId: ctx.guild?.id },
    });

    if (!infractee || !punishment || !reason) {
      return;
    }

    const infractionRecord = await prisma.infraction.create({
      data: {
        guildId: ctx.guild?.id ?? "",
        userId: infractee.id,
        moderatorId: ctx.user.id,
        punishment,
        reason,
      },
    });

    const infractionEmbed = createInfractionEmbed({
      infractee,
      moderator: ctx.user,
      punishment,
      reason,
      caseNumber: infractionRecord.caseNumber,
    });

    const infractionChannel = ctx.guild?.channels.cache.get(
      guildData?.infractionChannel || "",
    );

    const infracteeDms = ctx.users?.cache.get(infractee.id)?.dmChannel;

    if (infractionChannel?.isTextBased()) {
      await infractionChannel.send({
        content: `<@${infractee.id}>`,
        embeds: [infractionEmbed],
      });
    }

    if (infracteeDms?.isTextBased()) {
      await infracteeDms.send({
        embeds: [
          infractionEmbed.setFooter({
            text: "This message was sent to you privately.",
            iconURL: infractee.displayAvatarURL(),
          }),
        ],
      });
    }

    const successEmbed = createSuccessEmbed(
      "Infraction Issued",
      `Successfully infracted user.`,
    );

    if (ctx.channel?.isSendable()) {
      const reply = await ctx.editReply({ embeds: [successEmbed] });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await reply.delete();
    }

    logger.info("Infractee Database Data:", infracteeData);
  },
});
