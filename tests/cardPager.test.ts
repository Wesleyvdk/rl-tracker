import { test, expect } from "bun:test";
import { AttachmentBuilder } from "discord.js";
import { CardPager } from "../services/cardPager.service";

const images = (count = 3) =>
  Array.from(
    { length: count },
    (_, page) =>
      new AttachmentBuilder(Buffer.from(`image-${page}`), {
        name: `page-${page}.png`,
        description: `Page ${page + 1}`,
      }),
  );
function command(id = "message", owner = "owner") {
  const edits: any[] = [];
  return {
    edits,
    interaction: {
      user: { id: owner },
      editReply: async (payload: any) => {
        edits.push(payload);
        return { id };
      },
    } as any,
  };
}
const controls = (payload: any) => payload.components[0].toJSON().components;
function button(customId: string, message = "message", owner = "owner") {
  const edits: any[] = [],
    replies: any[] = [],
    followUps: any[] = [];
  let ack = 0;
  const interaction: any = {
    customId,
    message: { id: message },
    user: { id: owner },
    deferred: false,
    deferUpdate: async () => {
      ack++;
      interaction.deferred = true;
    },
    editReply: async (payload: any) => {
      edits.push(payload);
    },
    reply: async (payload: any) => {
      replies.push(payload);
    },
    followUp: async (payload: any) => {
      followUps.push(payload);
    },
  };
  return { interaction, edits, replies, followUps, acknowledged: () => ack };
}
function onlyImage(payload: any, page: number) {
  expect(payload.files).toHaveLength(1);
  expect(payload.embeds).toHaveLength(1);
  expect(payload.files[0].name).toBe(`page-${page}.png`);
  expect(payload.files[0].description).toBe(`Page ${page + 1}`);
  expect(payload.embeds[0].toJSON().image.url).toBe(
    `attachment://page-${page}.png`,
  );
  expect(payload.attachments).toEqual([]);
  expect(payload.allowedMentions.parse).toEqual([]);
}

test("cards navigate in the same message with one replacement attachment and disabled boundaries", async () => {
  const pager = new CardPager(),
    run = command();
  try {
    const source = images();
    await pager.send(run.interaction, source);
    let payload = run.edits[0],
      row = controls(payload);
    onlyImage(payload, 0);
    expect(new Set(row.map((c: any) => c.custom_id)).size).toBe(3);
    expect(row.map((c: any) => [c.label, c.disabled])).toEqual([
      ["Previous", true],
      ["1 / 3", true],
      ["Next", false],
    ]);
    for (const page of [1, 2, 1, 0]) {
      const click = button(
        row[page > Number(row[1].label[0]) - 1 ? 2 : 0].custom_id,
      );
      expect(await pager.handle(click.interaction)).toBe(true);
      expect(click.acknowledged()).toBe(1);
      expect(click.replies).toHaveLength(0);
      expect(click.edits).toHaveLength(1);
      payload = click.edits[0];
      row = controls(payload);
      onlyImage(payload, page);
      expect(row[1].label).toBe(`${page + 1} / 3`);
      expect(row[0].disabled).toBe(page === 0);
      expect(row[2].disabled).toBe(page === 2);
      expect(payload.files[0]).not.toBe(source[page]);
    }
  } finally {
    pager.dispose();
  }
});

test("single cards have no navigation and foreign users/messages cannot change a view", async () => {
  const pager = new CardPager(),
    single = command("single"),
    run = command();
  try {
    await pager.send(single.interaction, images(1));
    onlyImage(single.edits[0], 0);
    expect(single.edits[0].components).toEqual([]);
    await pager.send(run.interaction, images());
    const next = controls(run.edits[0])[2].custom_id;
    for (const [id, user] of [
      ["message", "stranger"],
      ["copied-message", "owner"],
    ]) {
      const click = button(next, id, user);
      await pager.handle(click.interaction);
      expect(click.acknowledged()).toBe(0);
      expect(click.edits).toHaveLength(0);
      expect(click.replies[0].flags).toBe(64);
      expect(click.replies[0].allowedMentions.parse).toEqual([]);
    }
    expect(await pager.handle(button("other-bot-action").interaction)).toBe(
      false,
    );
    const invalid = button(next.replace(/:1$/, ":9999"));
    await pager.handle(invalid.interaction);
    expect(invalid.replies[0].content).toBe("That page is unavailable.");
  } finally {
    pager.dispose();
  }
});

test("rapid clicks acknowledge promptly and serialize uploads without jumping twice", async () => {
  const pager = new CardPager(),
    run = command();
  try {
    await pager.send(run.interaction, images());
    const next = controls(run.edits[0])[2].custom_id;
    const first = button(next),
      duplicate = button(next);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    first.interaction.editReply = async (payload: any) => {
      first.edits.push(payload);
      await gate;
    };
    const a = pager.handle(first.interaction);
    const b = pager.handle(duplicate.interaction);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.acknowledged()).toBe(1);
    expect(duplicate.acknowledged()).toBe(1);
    expect(first.edits).toHaveLength(1);
    expect(duplicate.edits).toHaveLength(0);
    const last = button(controls(first.edits[0])[2].custom_id);
    const c = pager.handle(last.interaction);
    expect(last.acknowledged()).toBe(1);
    expect(last.edits).toHaveLength(0);
    release();
    await Promise.all([a, b, c]);
    expect(duplicate.edits).toHaveLength(0);
    onlyImage(last.edits[0], 2);
  } finally {
    pager.dispose();
  }
});

test("expiry and capacity eviction remove buttons and stale/restarted clicks get a private reply", async () => {
  let now = 100;
  const pager = new CardPager({
    lifetime: 600000,
    maxViews: 1,
    maxBytes: 100,
    now: () => now,
  });
  const first = command("first"),
    second = command("second");
  try {
    await pager.send(first.interaction, images());
    const old = controls(first.edits[0])[2].custom_id;
    await pager.send(second.interaction, images());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.edits.at(-1)).toEqual({ components: [] });
    const evicted = button(old, "first");
    await pager.handle(evicted.interaction);
    expect(evicted.replies[0].content).toContain("expired");
    now += 600001;
    const expired = button(controls(second.edits[0])[2].custom_id, "second");
    await pager.handle(expired.interaction);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(expired.edits).toHaveLength(0);
    expect(second.edits.at(-1)).toEqual({ components: [] });
    expect(expired.replies[0].flags).toBe(64);
    const restarted = new CardPager();
    try {
      const click = button(old, "first");
      await restarted.handle(click.interaction);
      expect(click.replies[0].content).toContain("expired");
    } finally {
      restarted.dispose();
    }
  } finally {
    pager.dispose();
  }
});

test("failed updates retain the current page and allow a later retry", async () => {
  const pager = new CardPager(),
    run = command();
  try {
    await pager.send(run.interaction, images());
    const next = controls(run.edits[0])[2].custom_id,
      failed = button(next);
    failed.interaction.editReply = async () => {
      throw new Error("Discord unavailable");
    };
    await pager.handle(failed.interaction);
    expect(failed.followUps[0].flags).toBe(64);
    const retry = button(next);
    await pager.handle(retry.interaction);
    onlyImage(retry.edits[0], 1);
    const unacked = button(controls(retry.edits[0])[2].custom_id);
    unacked.interaction.deferUpdate = async () => {
      throw new Error("Interaction expired");
    };
    await pager.handle(unacked.interaction);
    expect(unacked.edits).toHaveLength(0);
    expect(unacked.followUps).toHaveLength(0);
  } finally {
    pager.dispose();
  }
});

test("empty or oversized views fail before uploading and byte limits evict old views", async () => {
  const pager = new CardPager({
    lifetime: 600000,
    maxViews: 10,
    maxBytes: 24,
    now: Date.now,
  });
  const first = command("first"),
    second = command("second");
  try {
    await expect(pager.send(first.interaction, [])).rejects.toThrow("No cards");
    await expect(pager.send(first.interaction, images(4))).rejects.toThrow(
      "memory limit",
    );
    expect(first.edits).toHaveLength(0);
    await pager.send(first.interaction, images(2));
    await pager.send(second.interaction, images(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.edits.at(-1)).toEqual({ components: [] });
    const click = button(controls(second.edits[0])[2].custom_id, "second");
    await pager.handle(click.interaction);
    onlyImage(click.edits[0], 1);
  } finally {
    pager.dispose();
  }
});

test("pending uploads reserve capacity and failed initial uploads release it", async () => {
  const pager = new CardPager({
    lifetime: 600000,
    maxViews: 1,
    maxBytes: 24,
    now: Date.now,
  });
  const pending = command("pending"),
    blocked = command("blocked");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.interaction.editReply = async (payload: any) => {
    pending.edits.push(payload);
    await gate;
    throw new Error("Initial upload failed");
  };
  try {
    const first = pager.send(pending.interaction, images(2)).then(
      () => null,
      (error: Error) => error,
    );
    await expect(pager.send(blocked.interaction, images(2))).rejects.toThrow(
      "busy",
    );
    expect(blocked.edits).toHaveLength(0);
    release();
    expect((await first)?.message).toBe("Initial upload failed");
    await pager.send(blocked.interaction, images(2));
    onlyImage(blocked.edits[0], 0);
    const next = button(controls(blocked.edits[0])[2].custom_id, "blocked");
    await pager.handle(next.interaction);
    onlyImage(next.edits[0], 1);
  } finally {
    release();
    pager.dispose();
  }
});

test("active page uploads keep their reservation through capacity pressure and expiry", async () => {
  let now = 100;
  const pager = new CardPager({
    lifetime: 600000,
    maxViews: 10,
    maxBytes: 24,
    now: () => now,
  });
  const first = command("first"),
    second = command("second");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await pager.send(first.interaction, images(2));
    const next = controls(first.edits[0])[2].custom_id,
      click = button(next, "first");
    click.interaction.editReply = async (payload: any) => {
      click.edits.push(payload);
      await gate;
    };
    const pending = pager.handle(click.interaction);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(pager.send(second.interaction, images(2))).rejects.toThrow(
      "busy",
    );
    expect(second.edits).toHaveLength(0);
    now += 600001;
    const expired = button(next, "first");
    await pager.handle(expired.interaction);
    expect(expired.replies[0].content).toContain("expired");
    await expect(pager.send(second.interaction, images(2))).rejects.toThrow(
      "busy",
    );
    expect(first.edits).toHaveLength(1);
    release();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.edits.at(-1)).toEqual({ components: [] });
    await pager.send(second.interaction, images(2));
    onlyImage(second.edits[0], 0);
  } finally {
    release();
    pager.dispose();
  }
});
