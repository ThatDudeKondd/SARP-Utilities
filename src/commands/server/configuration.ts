import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  PermissionsBitField,
  RoleSelectMenuBuilder,
} from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../database/client.js";
import { logger } from "../../utils/logger.js";
import { CONSTANTS } from "../../config/constants.js";
import { SubCommand } from "../../types/UnifiedCommand.js";
import { logCommandError } from "../../middleware/commandLogger.js";

/**
 * One prompt in the setup wizard. Add a new entry here to add a new step —
 * nothing else in this file needs to change. `key` must match a field on
 * the Prisma `GuildConfig` model.
 */
type SetupStep =
  | {
      type: "role";
      key: string;
      title: string;
      description: string;
      /** Defaults: min 0, max 25 (i.e. optional, multi-select). */
      minValues?: number;
      maxValues?: number;
    }
  | {
      type: "channel";
      key: string;
      title: string;
      description: string;
      channelTypes?: ChannelType[];
      /** Whether a channel must be selected to proceed. Default: false. */
      required?: boolean;
    };

const SETUP_STEPS: SetupStep[] = [
  {
    type: "role",
    key: "directiveRoles",
    title: "Directive Roles",
    description:
      "Select one or more Directive roles that should have the highest authority in the server.",
  },
  {
    type: "role",
    key: "seniorHrRoles",
    title: "Senior Management Roles",
    description:
      "Select one or more Senior Management roles that are above Management.",
  },
  {
    type: "role",
    key: "managementRoles",
    title: "Management Roles",
    description:
      "Select one or more Management roles that are above Internal Affairs.",
  },
  {
    type: "role",
    key: "supervisorRoles",
    title: "Supervisor Roles",
    description:
      "Select one or more Supervisor roles that can execute /erlc run and higher-level actions.",
  },
  {
    type: "role",
    key: "administratorRoles",
    title: "Admin Roles",
    description:
      "Select one or more roles that should be treated as server administration roles.",
  },
  {
    type: "role",
    key: "moderatorRoles",
    title: "Moderator Roles",
    description:
      "Select one or more roles that should be able to use moderator tools and /erlc players.",
  },
  {
    type: "channel",
    key: "infractionChannel",
    title: "Infraction Channel",
    description:
      "Select a channel to set as the infraction channel that will be used for sending infractions.",
    channelTypes: [ChannelType.GuildText],
    required: true,
  },
  {
    type: "channel",
    key: "logsChannel",
    title: "Logs Channel",
    description:
      "Select a channel to set as the general logs channel, used for server activity and audit logging.",
    channelTypes: [ChannelType.GuildText],
    required: true,
  },
];

/** Formats a step's current selection for display in an embed field. */
function formatSelection(step: SetupStep, values: string[]): string {
  if (values.length === 0) return "None selected";

  return step.type === "channel"
    ? `<#${values[0]}>`
    : values.map((id) => `<@&${id}>`).join(", ");
}

/** Builds the select menu + action row for a single step. */
function buildStepComponents(step: SetupStep) {
  const customId = `setup_select_${step.key}`;

  if (step.type === "channel") {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(`Select ${step.title}`)
      .setMinValues(step.required ? 1 : 0)
      .setMaxValues(1);

    if (step.channelTypes) menu.setChannelTypes(step.channelTypes);

    return {
      row: new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu),
      componentType: ComponentType.ChannelSelect as const,
      customId,
    };
  }

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(`Select ${step.title}`)
    .setMinValues(step.minValues ?? 0)
    .setMaxValues(step.maxValues ?? 25);

  return {
    row: new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu),
    componentType: ComponentType.RoleSelect as const,
    customId,
  };
}

export default {
  name: "setup",
  description: "Setup the server's configuration",
  execute: async (ctx) => {
    try {
      if (!ctx.guild) {
        throw new Error("Setup must be run inside a guild.");
      }

      await ctx.defer();

      const isSuperAdmin = ctx.user.id === config.superAdminId;
      const isAdmin = ctx.member?.permissions?.has(
        PermissionsBitField.Flags.Administrator,
      );
      if (!isSuperAdmin && !isAdmin) {
        throw new Error(
          "Only a server administrator or the super admin can run setup.",
        );
      }

      const introEmbed = new EmbedBuilder()
        .setTitle("Server Setup")
        .setDescription(
          "We will now configure role-based access for ERLC commands. For each prompt, select one or more roles (or a channel, where asked) — submit without selecting anything if a step is optional and doesn't apply.",
        )
        .setColor(CONSTANTS.EMBED_COLOR)
        .setTimestamp();
      await ctx.editReply({ embeds: [introEmbed], components: [] });

      // Every step's selection, always stored as an array — a channel step
      // just has at most one entry — so downstream logic doesn't need to
      // branch on step type.
      const selectedValues: Record<string, string[]> = {};

      for (const step of SETUP_STEPS) {
        const { row, componentType, customId } = buildStepComponents(step);

        const stepEmbed = new EmbedBuilder()
          .setTitle(`Configure ${step.title}`)
          .setDescription(step.description)
          .addFields(
            {
              name: "Instructions",
              value:
                step.type === "channel" && step.required
                  ? "Choose a channel from the menu below."
                  : "Choose one or more from the menu below. If none apply, submit without selecting any.",
            },
            { name: "Current selection", value: "None selected" },
          )
          .setColor(CONSTANTS.EMBED_COLOR)
          .setTimestamp();

        await ctx.editReply({ embeds: [stepEmbed], components: [row] });
        const stepMessage = await ctx.fetchReply();

        const collectorFilter = (i: any) =>
          i.user.id === ctx.user.id && i.customId === customId;

        try {
          const selection = await stepMessage?.awaitMessageComponent({
            filter: collectorFilter,
            componentType,
            time: 60000,
          });

          selectedValues[step.key] = Array.isArray(selection?.values)
            ? selection.values
            : [];

          const selectedEmbed = new EmbedBuilder()
            .setTitle(`Configure ${step.title}`)
            .setDescription(
              `${step.description}\n\n**Selected:** ${formatSelection(step, selectedValues[step.key])}`,
            )
            .setColor(CONSTANTS.EMBED_COLOR)
            .setTimestamp();
          await ctx.editReply({ embeds: [selectedEmbed], components: [] });
        } catch (err: any) {
          if (err?.code === "InteractionCollectorError") {
            await ctx.editReply({
              content:
                "⏰ Setup timed out after 60 seconds. Please run `/server setup` again.",
              embeds: [],
              components: [],
            });

            logger.info(
              `Setup timed out for ${ctx.user.tag} in guild ${ctx.guild.id}`,
            );

            return;
          }

          throw err;
        }
      }

      // Build the Prisma payload generically from whatever steps ran, rather
      // than listing each field by hand — new steps need no changes here.
      const configData: Record<string, string | string[]> = {};
      for (const step of SETUP_STEPS) {
        const values = selectedValues[step.key] ?? [];
        configData[step.key] =
          step.type === "channel" ? (values[0] ?? "") : values;
      }

      const savedConfig = await prisma.guildConfig.upsert({
        where: { guildId: ctx.guild.id },
        update: configData,
        create: { guildId: ctx.guild.id, ...configData },
      });

      if (!savedConfig) {
        throw new Error("Failed to save guild configuration.");
      }

      // Same generic pattern for the summary — one field per step, in the
      // order steps are defined, with no per-field hardcoding.
      const completedEmbed = new EmbedBuilder()
        .setTitle("Server Setup Complete")
        .setDescription(
          "Server role configuration has been saved successfully.",
        )
        .setColor(CONSTANTS.EMBED_SUCCESS_COLOR)
        .setTimestamp()
        .addFields(
          SETUP_STEPS.map((step) => ({
            name: step.title,
            value: formatSelection(step, selectedValues[step.key] ?? []),
          })),
        );

      await ctx.editReply({ embeds: [completedEmbed], components: [] });
    } catch (e) {
      logger.error("Setup command failed:", e);
      await logCommandError(ctx, "/server setup", e).catch(() => {});
      await ctx
        .editReply({
          content: "❌ Something went wrong running setup.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  },
} satisfies SubCommand;
