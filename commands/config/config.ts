import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type Client,
  type ChatInputCommandInteraction,
} from "discord.js";
import { organizations } from "../../services/organization.service";
import { guildActor } from "../../services/guildAuthorization.service";
import {
  replyStatus,
  statusMessage,
} from "../../services/commandReply.service";
export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure this server's tracker bot")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s.setName("show").setDescription("View this server's bot settings"),
  )
  .addSubcommand((s) =>
    s
      .setName("editor")
      .setDescription("Enable or disable organization theme editing")
      .addBooleanOption((o) =>
        o
          .setName("enabled")
          .setDescription("Allow theme editor links")
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("role")
      .setDescription("Delegate bot settings or theme editing (Manage Server)")
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Permission to delegate")
          .setRequired(true)
          .addChoices(
            { name: "Theme editing", value: "themes" },
            { name: "Bot settings", value: "settings" },
          ),
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Server role").setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName("allowed")
          .setDescription("Allow this role; false removes delegation")
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("revoke-links")
      .setDescription("Close all active theme editor sessions"),
  );
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.guildId) throw new Error("Use this command in a server.");
    const guild = interaction.guildId,
      actor = await guildActor(client, guild, interaction.user.id),
      action = interaction.options.getSubcommand();
    if (!organizations.can(guild, actor, "settings"))
      throw new Error("Ask a server admin or a delegated settings role.");
    if (action === "role") {
      if (!actor.manage)
        throw new Error("Manage Server is required to grant or remove roles.");
      const role = interaction.options.getRole("role", true);
      if (role.managed || role.id === guild)
        throw new Error("Choose a regular server role other than @everyone.");
      organizations.setRole(
        guild,
        actor.id,
        interaction.options.getString("scope", true) as "themes" | "settings",
        role.id,
        interaction.options.getBoolean("allowed", true),
      );
    } else if (action === "editor")
      organizations.setEnabled(
        guild,
        actor.id,
        interaction.options.getBoolean("enabled", true),
      );
    else if (action === "revoke-links")
      organizations.revokeLinks(guild, actor.id);
    const settings = organizations.settings(guild);
    return interaction.editReply(
      statusMessage(
        "Server settings",
        `Theme editor: **${settings.enabled ? "enabled" : "disabled"}**\nOrganization access: **${organizations.approved(guild) ? "approved" : "not approved"}**\n${settings.roles.length ? settings.roles.map((r) => `${r.scope}: <@&${r.role_id}>`).join("\n") : "Delegated roles: none"}`,
        "success",
      ),
    );
  } catch (e) {
    return replyStatus(
      interaction,
      "Settings unavailable",
      e instanceof Error ? e.message : "Please try again.",
      "error",
    );
  }
}
