import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import type { SeasonData, AverageStats, SeasonStatsResult } from "../types";
import { averageModel } from "./averageCardModel.service";
import { rankAppearance, nonnegative } from "./rankCardModel.service";
import {
  WIDTH,
  PAD,
  WHITE,
  MUTED,
  background,
  heading,
  panel,
  text,
  date,
  icon,
  shortMode,
} from "./cardTheme.service";
export interface AverageCardData {
  name: string;
  seasonData: SeasonData[];
  averageStats?: AverageStats[];
  fetchedAt?: number;
  stale?: boolean;
  preview?: boolean;
  partial?: boolean;
  coverage?: SeasonStatsResult["coverage"];
}
export class HistoryCardLimitError extends Error {}
export default async function generateAverageCards(
  data: AverageCardData,
): Promise<AttachmentBuilder[]> {
  const model = averageModel(data.seasonData),
    modePages = Math.max(1, Math.ceil(model.modes.length / 4)),
    seasonPages = Math.max(1, Math.ceil(model.rows.length / 14));
  const total = modePages * seasonPages;
  if (total > 10)
    throw new HistoryCardLimitError(
      "Choose fewer seasons or competitive-only to fit this history.",
    );
  const images: AttachmentBuilder[] = [];
  for (let mp = 0; mp < modePages; mp++)
    for (let sp = 0; sp < seasonPages; sp++) {
      const modes = model.modes.slice(mp * 4, mp * 4 + 4),
        rows = model.rows.slice(sp * 14, sp * 14 + 14),
        page = images.length + 1;
      const height = 555 + Math.max(1, rows.length) * 45,
        canvas = Canvas.createCanvas(WIDTH, height),
        ctx = canvas.getContext("2d");
      background(ctx, WIDTH, height);
      heading(ctx, data.preview ? "DESIGN PREVIEW · SEASON HISTORY" : "SEASON HISTORY", data.name, `${page} / ${total}`);
      text(
        ctx,
        `${model.rows.length}${data.coverage ? ` / ${data.coverage.requested.length}` : ""} SEASONS${data.partial ? " · PARTIAL" : ""}${data.coverage?.unavailable?.length ? ` · ${data.coverage.unavailable.length} NO DATA` : ""}`,
        PAD + 5,
        125,
        15,
        data.partial ? "#f3cb72" : MUTED,
        500,
        true,
      );
      text(
        ctx,
        `${model.known === null ? "—" : model.known.toLocaleString("en-US")}${model.partial && model.known !== null ? "+" : ""} KNOWN MATCHES`,
        650,
        125,
        15,
        "#79e2c2",
        590,
        true,
      );
      const count = Math.max(1, modes.length),
        gap = 16,
        w = (WIDTH - PAD * 2 - gap * (count - 1)) / count;
      for (const [i, mode] of modes.entries()) {
        const stat = model.averages.find((a) => a.playlist === mode),
          look = rankAppearance(stat?.averageRankName || ""),
          x = PAD + i * (w + gap),
          y = 155;
        panel(ctx, x, y, w, 195, look.color);
        text(ctx, shortMode(mode), x + 20, y + 34, 20, WHITE, w - 40, true);
        text(
          ctx,
          stat?.averageMatches === null || stat?.averageMatches === undefined
            ? "—"
            : stat.averageMatches.toLocaleString("en-US"),
          x + 20,
          y + 91,
          42,
          WHITE,
          w - 90,
          true,
        );
        text(
          ctx,
          "AVG MATCHES / SEASON",
          x + 20,
          y + 116,
          12,
          MUTED,
          w - 35,
          true,
        );
        if (look.icon !== null) {
          const badge = await icon(look.icon);
          if (badge) ctx.drawImage(badge, x + w - 64, y + 57, 42, 42);
        }
        text(
          ctx,
          stat?.averageRankTier ? stat.averageRankName : "Rank unavailable",
          x + 20,
          y + 158,
          16,
          look.color,
          w - 40,
          true,
        );
        text(ctx, "AVG RANK", x + 20, y + 180, 11, MUTED, w - 40);
      }
      text(ctx, "MATCHES PER SEASON", PAD + 5, 391, 17, WHITE, 750, true);
      const seasonW = 178,
        totalW = 142,
        colW = (WIDTH - PAD * 2 - seasonW - totalW) / Math.max(1, modes.length);
      const tableY = 411;
      ctx.fillStyle = "#25324b";
      ctx.fillRect(PAD, tableY, WIDTH - PAD * 2, 39);
      text(ctx, "SEASON", PAD + 15, tableY + 26, 14, MUTED, seasonW - 25, true);
      modes.forEach((m, i) =>
        text(
          ctx,
          shortMode(m),
          PAD + seasonW + i * colW + 10,
          tableY + 26,
          14,
          MUTED,
          colW - 20,
          true,
        ),
      );
      text(
        ctx,
        modePages > 1 ? "ALL MODES" : "KNOWN TOTAL",
        WIDTH - PAD - totalW + 8,
        tableY + 26,
        13,
        MUTED,
        totalW - 15,
        true,
      );
      for (const [i, row] of rows.entries()) {
        const y = tableY + 39 + i * 45;
        ctx.fillStyle = i % 2 ? "#111b2b" : "#172235";
        ctx.fillRect(PAD, y, WIDTH - PAD * 2, 45);
        text(ctx, row.season, PAD + 15, y + 29, 16, WHITE, seasonW - 25, true);
        modes.forEach((m, j) => {
          const n = nonnegative(row.playlists[m]?.matches);
          text(
            ctx,
            n === null ? "—" : n.toLocaleString("en-US"),
            PAD + seasonW + j * colW + 10,
            y + 29,
            18,
            n === null ? MUTED : WHITE,
            colW - 20,
          );
        });
        text(
          ctx,
          row.known === null
            ? "—"
            : row.known.toLocaleString("en-US") + (row.complete ? "" : "+"),
          WIDTH - PAD - totalW + 8,
          y + 29,
          18,
          "#79e2c2",
          totalW - 15,
          true,
        );
      }
      text(
        ctx,
        `${model.average === null ? "—" : model.average.toLocaleString("en-US")} AVG / COMPLETE SEASON${model.partial ? "   ·   + PARTIAL" : ""}`,
        PAD,
        height - 28,
        13,
        MUTED,
        740,
      );
      const at = data.fetchedAt,
        known =
          Number.isSafeInteger(at) && at! > 0 && at! <= Date.now() + 60000;
      text(
        ctx,
        known
          ? `${data.stale || Date.now() - at! > 3600000 ? "CACHED" : "UPDATED"} ${date(at!)}`
          : "UPDATE TIME UNKNOWN",
        820,
        height - 28,
        13,
        data.stale ? "#f3cb72" : MUTED,
        428,
      );
      const image = new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: `average-matches-${page}.png`,
      });
      image.setDescription(
        `${data.name}: season history page ${page}/${total}. ${modes.join(", ")}. ${rows.map((s) => `${s.season}: ${s.known ?? "unknown"}${s.complete ? "" : " partial"} matches`).join("; ")}. Average ranks are ordinal tier averages, not MMR.`.slice(
          0,
          1024,
        ),
      );
      images.push(image);
    }
  return images;
}
