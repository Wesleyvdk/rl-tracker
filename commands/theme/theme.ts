import {
  SlashCommandBuilder,
  MessageFlags,
  ApplicationIntegrationType,
  InteractionContextType,
  type Client,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAccount } from "../../services/database.service";
import { themePreferences } from "../../services/theme.service";
import { getTheme } from "../../services/themeRegistry.service";
import themePreview from "../../services/themePreview.service";
import { organizations } from "../../services/organization.service";
import { guildActor } from "../../services/guildAuthorization.service";
import {
  replyStatus,
  statusMessage,
  imageMessage,
} from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("theme")
  .setDescription("Choose your card style")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("Browse available card themes"),
  )
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Save a theme for your linked account")
      .addStringOption((o) =>
        o
          .setName("style")
          .setDescription("Card theme")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("preview")
      .setDescription("Preview a card theme")
      .addStringOption((o) =>
        o
          .setName("style")
          .setDescription("Card theme")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("reset").setDescription("Use the server or default theme again"),
  )
  .addSubcommand((s) =>
    s
      .setName("editor")
      .setDescription("Open your organization's private 24-hour theme editor"),
  )
  .addSubcommand((s) =>
    s
      .setName("server")
      .setDescription("Set the server theme; omit style to reset")
      .addStringOption((o) =>
        o
          .setName("style")
          .setDescription("Card theme; omit to reset")
          .setAutocomplete(true),
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const query = String(interaction.options.getFocused()).toLowerCase();
  await interaction.respond(
    themePreferences.registry
      .available(interaction.guildId)
      .filter((t) => `${t.id} ${t.name}`.toLowerCase().includes(query))
      .slice(0, 25)
      .map((t) => ({ name: t.name, value: t.id })),
  );
}
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  try {
    const action = interaction.options.getSubcommand();
    if (action === "editor") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!interaction.guildId) throw new Error("Server required");
      const base = process.env.THEME_EDITOR_BASE_URL;
      if (!base)
        return replyStatus(
          interaction,
          "Editor unavailable",
          "The web editor hasn't been configured yet.",
        );
      const actor = await guildActor(
        client,
        interaction.guildId,
        interaction.user.id,
      );
      if (!organizations.can(interaction.guildId, actor, "themes"))
        return replyStatus(
          interaction,
          "Theme editor access required",
          "Ask a server admin or a delegated theme editor.",
          "error",
        );
      try {
        const link = organizations.issueLink(interaction.guildId, actor.id);
        return interaction.editReply(
          statusMessage(
            "Organization theme editor",
            `[Open your editor](${new URL(`/editor/${link.token}`, base).toString()})\nExpires <t:${Math.floor(link.expiresAt / 1000)}:R>. Sign in with this Discord account.`,
          ),
        );
      } catch (e) {
        return replyStatus(
          interaction,
          "Editor unavailable",
          e instanceof Error ? e.message : "Please try again.",
          "error",
        );
      }
    }
    if (action === "list") {
      const current = getTheme(
        themePreferences.resolve(interaction.user.id, interaction.guildId),
      );
      const payload = statusMessage(
        "Card themes",
        `Current: **${current.name}** · Try \`/theme preview\`.`,
      );
      payload.embeds[0].addFields(
        themePreferences.registry
          .available(interaction.guildId)
          .slice(0, 25)
          .map((t) => ({ name: t.name, value: t.description, inline: true })),
      );
      return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    if (action === "server") {
      if (!interaction.guildId)
        return replyStatus(
          interaction,
          "Server only",
          "Use this command in your server.",
        );
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const actor = await guildActor(
        client,
        interaction.guildId,
        interaction.user.id,
      );
      if (!organizations.can(interaction.guildId, actor, "themes"))
        return replyStatus(
          interaction,
          "Theme editing required",
          "Ask a server admin or a delegated theme editor.",
          "error",
        );
      const id = interaction.options.getString("style") ?? undefined;
      if (id && !themePreferences.registry.allowed(id, interaction.guildId))
        return replyStatus(
          interaction,
          "Theme unavailable",
          "Choose one of the available themes.",
          "error",
        );
      themePreferences.setGuild(interaction.guildId, id);
      return replyStatus(
        interaction,
        "Server theme updated",
        getTheme(themePreferences.guildTheme(interaction.guildId)).name,
        "success",
      );
    }
    if (action === "preview") {
      const id = interaction.options.getString("style", true);
      if (!themePreferences.registry.allowed(id, interaction.guildId))
        return replyStatus(
          interaction,
          "Theme unavailable",
          "Choose one of the available themes.",
          "error",
        );
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return await interaction.editReply(
        imageMessage([await themePreview(id)], id),
      );
    }
    if (!getAccount(interaction.user.id))
      return replyStatus(interaction, "Profile needed", "Use `/link` first.");
    if (action === "reset") {
      themePreferences.resetUser(interaction.user.id);
      return replyStatus(
        interaction,
        "Theme reset",
        getTheme(
          themePreferences.resolve(interaction.user.id, interaction.guildId),
        ).name,
        "success",
      );
    }
    const id = interaction.options.getString("style", true);
    if (!themePreferences.registry.allowed(id, interaction.guildId))
      return replyStatus(
        interaction,
        "Theme unavailable",
        "Choose one of the available themes.",
        "error",
      );
    themePreferences.setUser(interaction.user.id, id, interaction.guildId);
    return replyStatus(
      interaction,
      "Theme updated",
      getTheme(id).name,
      "success",
    );
  } catch {
    return replyStatus(
      interaction,
      "Couldn't update theme",
      "Please try again.",
      "error",
    ).catch(() => {});
  }
}
