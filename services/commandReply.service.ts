import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  escapeMarkdown,
} from "discord.js";
import { getTheme } from "./themeRegistry.service";
const colors = { success: 0x79e2c2, error: 0xff9eaf, info: 0x9bb7ff };
export function statusMessage(
  title: string,
  description: string,
  tone: keyof typeof colors = "info",
) {
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(colors[tone])
        .setTitle(title)
        .setDescription(description),
    ],
    allowedMentions: { parse: [] as [] },
  };
}
export function playerLabel(name: string) {
  return escapeMarkdown(name).slice(0, 300);
}
export async function replyStatus(
  interaction: any,
  title: string,
  description: string,
  tone: keyof typeof colors = "info",
) {
  const payload = statusMessage(title, description, tone);
  return interaction.deferred || interaction.replied
    ? interaction.editReply(payload)
    : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}
export function imageMessage(images: AttachmentBuilder[], theme?: string) {
  return {
    content: "",
    embeds: images.map((image) =>
      new EmbedBuilder()
        .setColor(parseInt(getTheme(theme).colors.accent.slice(1), 16))
        .setImage(`attachment://${image.name}`),
    ),
    files: images,
    allowedMentions: { parse: [] as [] },
  };
}
