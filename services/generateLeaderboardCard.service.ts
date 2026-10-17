import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import {
  WIDTH,
  PAD,
  WHITE,
  MUTED,
  background,
  heading,
  panel,
  text,
  pill,
  date,
  icon,
  shortMode,
} from "./cardTheme.service";
import { rankAppearance, nonnegative } from "./rankCardModel.service";
import {
  leaderboardModel,
  type BoardAccount,
} from "./leaderboardModel.service";

export default async function generateLeaderboardCards(
  accounts: BoardAccount[],
  mode: "competitive" | "extra",
  guild: string,
  preview = false,
): Promise<AttachmentBuilder[]> {
  const model = leaderboardModel(accounts, mode),
    pages = Math.max(1, Math.ceil(model.rows.length / 10)),
    images: AttachmentBuilder[] = [];
  for (let page = 0; page < pages; page++) {
    const rows = model.rows.slice(page * 10, page * 10 + 10),
      height = 220 + Math.max(1, rows.length) * 126;
    const canvas = Canvas.createCanvas(WIDTH, height),
      ctx = canvas.getContext("2d");
    background(ctx, WIDTH, height);
    heading(
      ctx,
      `${preview ? "DESIGN PREVIEW · " : ""}${mode === "competitive" ? "COMPETITIVE" : "EXTRA MODES"} · LEADERBOARD`,
      guild,
      `${page + 1} / ${pages}`,
    );
    text(ctx, "HIGHEST SELECTED-MODE MMR", PAD + 6, 124, 14, MUTED, 800, true);
    const start = 350,
      col = (WIDTH - PAD - start) / model.modes.length;
    model.modes.forEach((name, i) =>
      text(
        ctx,
        shortMode(name),
        start + i * col + 8,
        155,
        16,
        MUTED,
        col - 16,
        true,
      ),
    );
    for (const [i, row] of rows.entries()) {
      const y = 174 + i * 126,
        place = page * 10 + i + 1,
        color =
          place === 1
            ? "#f3cb72"
            : place === 2
              ? "#c2d0e2"
              : place === 3
                ? "#c69070"
                : "#9bb7ff";
      panel(ctx, PAD, y, WIDTH - PAD * 2, 110, color);
      text(
        ctx,
        String(place).padStart(2, "0"),
        PAD + 18,
        y + 45,
        25,
        color,
        45,
        true,
      );
      text(ctx, row.playername, PAD + 77, y + 39, 22, WHITE, 220, true);
      const at = row.fetchedAt;
      const fresh =
        Number.isSafeInteger(at) && at! > 0 && at! <= Date.now() + 60000;
      const stale = row.stale || !fresh || Date.now() - at! > 3600000;
      text(
        ctx,
        fresh ? `${stale ? "CACHED · " : ""}${date(at!)}` : "TIME UNKNOWN",
        PAD + 77,
        y + 68,
        12,
        stale ? "#f3cb72" : MUTED,
        225,
      );
      text(
        ctx,
        `${row.score.toLocaleString("en-US")} MMR`,
        PAD + 77,
        y + 93,
        15,
        color,
        220,
        true,
      );
      for (const [j, rank] of row.selected.entries()) {
        const x = start + j * col + 8,
          mmr = nonnegative(rank?.mmr),
          look = rankAppearance(rank?.rank || "");
        if (mmr !== null && look.icon !== null) {
          const badge = await icon(look.icon);
          if (badge) ctx.drawImage(badge, x, y + 20, 36, 36);
        }
        text(
          ctx,
          mmr === null ? "—" : mmr.toLocaleString("en-US"),
          x + 46,
          y + 46,
          27,
          WHITE,
          col - 62,
          true,
        );
        text(
          ctx,
          rank?.rank || "Unavailable",
          x,
          y + 76,
          14,
          look.color,
          col - 20,
        );
        text(ctx, rank?.division || "—", x, y + 96, 12, MUTED, col - 20);
      }
    }
    if (!rows.length)
      text(ctx, "No ranks available", PAD + 30, 230, 25, MUTED, 1000);
    text(
      ctx,
      `TOP ${model.rows.length}${model.total > 25 ? ` OF ${model.total}` : ""}`,
      PAD,
      height - 17,
      14,
      MUTED,
      1100,
    );
    const image = new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: `leaderboard-${page + 1}.png`,
    });
    image.setDescription(
      `${guild}: ${mode} leaderboard, page ${page + 1}/${pages}, ordered by highest selected-mode MMR. ${rows.map((r, i) => `${page * 10 + i + 1}. ${r.playername}: ${r.score} MMR`).join("; ")}`.slice(
        0,
        1024,
      ),
    );
    images.push(image);
  }
  return images;
}
