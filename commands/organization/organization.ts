import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
  type Client,
  type ChatInputCommandInteraction,
} from "discord.js";
import { organizations } from "../../services/organization.service";
import {
  guildActor,
  isBotOperator,
} from "../../services/guildAuthorization.service";
import {
  replyStatus,
  statusMessage,
} from "../../services/commandReply.service";
export const data = new SlashCommandBuilder()
  .setName("organization")
  .setDescription("Apply for organization features")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName("apply")
      .setDescription("Request custom organization themes (Manage Server)")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Organization name")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((o) =>
        o
          .setName("website")
          .setDescription("Organization website, beginning with https://")
          .setRequired(true)
          .setMaxLength(200),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("View this server's organization access"),
  )
  .addSubcommand((s) =>
    s
      .setName("pending")
      .setDescription("View pending applications (bot owner)"),
  )
  .addSubcommand((s) =>
    s
      .setName("inspect")
      .setDescription("Read an organization application (bot owner)")
      .addStringOption((o) =>
        o
          .setName("server")
          .setDescription("Discord server ID")
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("review")
      .setDescription("Approve or revoke organization access (bot owner)")
      .addStringOption((o) =>
        o
          .setName("server")
          .setDescription("Discord server ID")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("decision")
          .setDescription("Access decision")
          .setRequired(true)
          .addChoices(
            { name: "Approve", value: "approved" },
            { name: "Deny", value: "denied" },
            { name: "Revoke", value: "revoked" },
          ),
      ),
  );
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.guildId) throw new Error("Use this command in a server.");
    const action = interaction.options.getSubcommand();
    if (["review", "pending", "inspect"].includes(action)) {
      if (!(await isBotOperator(client, interaction.user.id)))
        throw new Error(
          "Only the bot application owner can review organization access.",
        );
      if (action === "pending")
        return interaction.editReply(
          statusMessage(
            "Organization applications",
            organizations
              .applications()
              .map(
                (a: any) =>
                  `${a.guild_id} · ${a.name.replace(/[@*_`~|\\]/g, "")}`,
              )
              .join("\n") || "No pending applications.",
          ),
        );
      const guild = interaction.options.getString("server", true);
      if (action === "inspect") {
        const application = organizations.application(guild) as any;
        if (!application)
          throw new Error("No application exists for that server.");
        const payload = statusMessage(
          "Organization application",
          `Server: ${guild} · **${application.status}**`,
        );
        payload.embeds[0].addFields(
          { name: "Organization", value: escapeMarkdown(application.name) },
          { name: "Website", value: escapeMarkdown(application.website) },
          { name: "Requested by", value: application.requested_by },
        );
        return interaction.editReply(payload);
      }
      const status = interaction.options.getString("decision", true) as
        | "approved"
        | "denied"
        | "revoked";
      if (!["approved", "denied", "revoked"].includes(status))
        throw new Error("Choose a valid decision.");
      organizations.review(guild, interaction.user.id, status);
      return interaction.editReply(
        statusMessage(
          "Organization access updated",
          `${guild}: **${status}**`,
          "success",
        ),
      );
    }
    const actor = await guildActor(
      client,
      interaction.guildId,
      interaction.user.id,
    );
    if (!actor.manage)
      throw new Error(
        "Manage Server is required to apply or view organization details.",
      );
    if (action === "apply") {
      organizations.apply(
        interaction.guildId,
        actor.id,
        interaction.options.getString("name", true),
        interaction.options.getString("website", true),
      );
      return interaction.editReply(
        statusMessage(
          "Application received",
          "Organization access is pending. Once approved, your editors can publish themes immediately.",
          "success",
        ),
      );
    }
    const a = organizations.application(interaction.guildId) as any;
    return interaction.editReply(
      statusMessage(
        "Organization access",
        a
          ? `Status: **${a.status}**`
          : "No application yet. Use `/organization apply`.",
      ),
    );
  } catch (e) {
    return replyStatus(
      interaction,
      "Organization request unavailable",
      e instanceof Error ? e.message : "Please try again.",
      "error",
    );
  }
}
