import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { imageMessage } from "./commandReply.service";

const prefix = "rl-card:";
interface View {
  id: string;
  owner: string;
  message: string;
  images: AttachmentBuilder[];
  bytes: number;
  page: number;
  expires: number;
  closed: boolean;
  initializing: boolean;
  pending: number;
  timer?: ReturnType<typeof setTimeout>;
  queue: Promise<void>;
  edit: (payload: InteractionEditReplyOptions) => Promise<unknown>;
}

// Views are local and temporary; no extra Discord messages or database rows.
export class CardPager {
  private views = new Map<string, View>();
  constructor(
    private options = {
      lifetime: 10 * 60 * 1000,
      maxViews: 32,
      maxBytes: 64 * 1024 * 1024,
      now: Date.now,
    },
  ) {}

  private payload(view: View, page: number): InteractionEditReplyOptions {
    const image = view.images[page];
    // Use a new builder for each upload; Discord's payload resolver may mutate it.
    const file = new AttachmentBuilder(image.attachment, {
      name: image.name!,
      description: image.description ?? undefined,
    });
    return {
      ...imageMessage([file]),
      attachments: [],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}${view.id}:p:${Math.max(0, page - 1)}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId(`${prefix}${view.id}:c:${page}`)
            .setLabel(`${page + 1} / ${view.images.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(
              `${prefix}${view.id}:n:${Math.min(view.images.length - 1, page + 1)}`,
            )
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === view.images.length - 1),
        ),
      ],
    };
  }

  private close(view: View, removeButtons = true) {
    if (view.closed) return;
    view.closed = true;
    clearTimeout(view.timer);
    view.images = [];
    // An in-flight edit still owns its upload buffer. Keep its reservation until
    // the queue settles, even if the view expires in the meantime.
    if (view.initializing) return;
    const release = () => {
      this.views.delete(view.id);
      if (removeButtons) return view.edit({ components: [] });
    };
    if (view.pending) void view.queue.then(release).catch(() => {});
    else void Promise.resolve(release()).catch(() => {});
  }

  async send(
    interaction: ChatInputCommandInteraction,
    images: AttachmentBuilder[],
  ) {
    if (!images.length) throw new Error("No cards to display");
    if (images.length === 1)
      return interaction.editReply({
        ...imageMessage(images),
        attachments: [],
        components: [],
      });
    const bytes = images.reduce((n, image) => {
      if (!Buffer.isBuffer(image.attachment))
        throw new Error("Card navigation requires locally rendered images");
      return n + image.attachment.length;
    }, 0);
    if (bytes > this.options.maxBytes)
      throw new Error("Card view exceeds local memory limit");
    const view: View = {
      id: randomBytes(12).toString("hex"),
      owner: interaction.user.id,
      message: "",
      images,
      bytes,
      page: 0,
      expires: this.options.now() + this.options.lifetime,
      closed: false,
      initializing: true,
      pending: 0,
      queue: Promise.resolve(),
      edit: (payload) => interaction.editReply(payload),
    };
    // Reserve memory before uploading. Pending uploads cannot be evicted: their
    // transport still holds a buffer until Discord accepts or rejects the edit.
    for (const existing of this.views.values())
      if (existing.message && existing.expires <= this.options.now())
        this.close(existing);
    while (
      this.views.size >= this.options.maxViews ||
      [...this.views.values()].reduce((n, item) => n + item.bytes, bytes) >
        this.options.maxBytes
    ) {
      const oldest = [...this.views.values()].find(
        (existing) =>
          existing.message && !existing.closed && existing.pending === 0,
      );
      if (!oldest)
        throw new Error("Card navigation is busy. Try again shortly.");
      this.close(oldest);
    }
    this.views.set(view.id, view);
    let message;
    try {
      message = await interaction.editReply(this.payload(view, 0));
    } catch (error) {
      view.initializing = false;
      this.close(view, false);
      this.views.delete(view.id);
      throw error;
    }
    view.initializing = false;
    if (view.closed) {
      this.views.delete(view.id);
      return message;
    }
    view.message = message.id;
    view.expires = this.options.now() + this.options.lifetime;
    view.timer = setTimeout(() => this.close(view), this.options.lifetime);
    view.timer.unref();
    return message;
  }

  async handle(button: ButtonInteraction): Promise<boolean> {
    if (!button.customId.startsWith(prefix)) return false;
    const match = /^rl-card:([a-f0-9]{24}):[pnc]:(0|[1-9]\d{0,3})$/.exec(
      button.customId,
    );
    const view = match ? this.views.get(match[1]) : undefined;
    const privateReply = (content: string) =>
      button.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    if (
      !view ||
      view.closed ||
      view.expires <= this.options.now() ||
      view.message !== button.message.id
    ) {
      if (view && view.expires <= this.options.now()) this.close(view);
      await privateReply("This view expired. Run the command again.");
      return true;
    }
    if (button.user.id !== view.owner) {
      await privateReply("Run the command to browse your own cards.");
      return true;
    }
    const page = Number(match![2]);
    if (page >= view.images.length) {
      await privateReply("That page is unavailable.");
      return true;
    }
    // Acknowledge immediately, even while an earlier upload is still in flight.
    const acknowledged = button.deferUpdate();
    void acknowledged.catch(() => {});
    view.pending++;
    view.queue = view.queue
      .then(async () => {
        await acknowledged;
        if (view.closed || page === view.page) return;
        await button.editReply(this.payload(view, page));
        view.page = page;
      })
      .catch(async () => {
        if (button.deferred)
          await button
            .followUp({
              content: "Couldn't change page. Try again.",
              flags: MessageFlags.Ephemeral,
              allowedMentions: { parse: [] },
            })
            .catch(() => {});
      })
      .finally(() => {
        view.pending--;
      });
    await view.queue;
    return true;
  }

  dispose() {
    for (const view of this.views.values()) this.close(view, false);
  }
}

export const cardPager = new CardPager();
