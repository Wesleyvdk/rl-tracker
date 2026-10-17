import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type Client,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAccount } from "../../services/database.service";
import { themePreferences } from "../../services/theme.service";
import { getTheme } from "../../services/themeRegistry.service";
import themePreview from "../../services/themePreview.service";
import {
  replyStatus,
  statusMessage,
  imageMessage,
} from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("theme")
  .setDescription("Choose your card style")
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
      .setName("server")
      .setDescription(
        "Set the server theme; omit style to reset (Manage Server)",
      )
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
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return replyStatus(
          interaction,
          "Manage Server required",
          "Ask a server admin to change its theme.",
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
