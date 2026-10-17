import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import {
  makeRankCardModel,
  historyGeometry,
  type RankCardInput,
} from "./rankCardModel.service";
import {
  WIDTH,
  PAD,
  GAP,
  TILE,
  TOP,
  MUTED,
  WHITE,
  rounded,
  text,
  pill,
  date,
  shortDate,
  icon,
  background,
} from "./cardTheme.service";
export function rankCardHeight(count: number) {
  return TOP + Math.ceil(Math.max(7, count) / 2) * (TILE + GAP) + 60;
}
export default async function generateRankCard(
  input: RankCardInput,
): Promise<AttachmentBuilder> {
  const model = makeRankCardModel(input),
    height = rankCardHeight(model.modes.length);
  const canvas = Canvas.createCanvas(WIDTH, height),
    ctx = canvas.getContext("2d");
  background(ctx, WIDTH, height);
  ctx.fillStyle = "#9bb7ff";
  rounded(ctx, PAD, 31, 4, 101, 2);
  ctx.fill();
  text(
    ctx,
    input.preview
      ? "DESIGN PREVIEW · SYNTHETIC HISTORY"
      : `PLAYER REPORT · ${(input.platform || "ROCKET LEAGUE").toUpperCase()}`,
    PAD + 19,
    49,
    15,
    input.preview ? "#f3cb72" : MUTED,
    880,
    true,
  );
  text(ctx, input.name, PAD + 17, 101, 43, WHITE, 880, true);
  text(
    ctx,
    input.rewardLevel || "Reward level unavailable",
    PAD + 19,
    132,
    18,
    MUTED,
    860,
  );
  text(ctx, "RL / TRACKER", 1025, 48, 23, WHITE, 223, true);
  pill(
    ctx,
    model.at ? (model.stale ? "CACHED" : "UPDATED") : "TIME UNAVAILABLE",
    1025,
    69,
    model.stale || !model.at ? "#f3cb72" : "#79e2c2",
    223,
  );
  text(
    ctx,
    `${model.available} / ${model.modes.length} MODES AVAILABLE`,
    1025,
    126,
    15,
    MUTED,
    223,
  );
  const w = (WIDTH - PAD * 2 - GAP) / 2;
  for (const [i, m] of model.modes.entries()) {
    const x =
        model.modes.length % 2 && i === model.modes.length - 1
          ? (WIDTH - w) / 2
          : PAD + (i % 2) * (w + GAP),
      y = TOP + Math.floor(i / 2) * (TILE + GAP);
    ctx.save();
    rounded(ctx, x, y, w, TILE, 18);
    ctx.clip();
    ctx.fillStyle = "#111c2b";
    ctx.fillRect(x, y, w, TILE);
    const wash = ctx.createLinearGradient(x, y, x + w, y + TILE);
    wash.addColorStop(0, m.color + "13");
    wash.addColorStop(0.7, m.color + "03");
    wash.addColorStop(1, m.color + "0b");
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, w, TILE);
    // A quiet version of the same observed curve forms the panel backdrop.
    // Keep all breaks: decoration must not invent continuous missing history.
    if (m.history.values.length >= 2) {
      const backdrop = historyGeometry(m.history.points, w - 30, 110);
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      for (const p of backdrop) {
        if (p.y === null) continue;
        if (p.join) ctx.lineTo(x + 15 + p.x, y + 96 + p.y);
        else ctx.moveTo(x + 15 + p.x, y + 96 + p.y);
      }
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.restore();
    }
    const edge = ctx.createLinearGradient(x, y, x + w, y);
    edge.addColorStop(0, m.color);
    edge.addColorStop(1, m.color + "08");
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, w, 3);
    text(
      ctx,
      String(i + 1).padStart(2, "0"),
      x + 23,
      y + 36,
      16,
      m.color,
      30,
      true,
    );
    text(
      ctx,
      m.playlist.replace(/^Ranked /, ""),
      x + 59,
      y + 37,
      24,
      WHITE,
      w - 167,
      true,
    );
    text(ctx, m.rank, x + 24, y + 71, 22, m.color, w - 132, true);
    text(ctx, m.division, x + 24, y + 97, 17, MUTED, 230);
    if (m.icon !== null) {
      const image = await icon(m.icon);
      if (image) {
        ctx.shadowColor = m.color + "70";
        ctx.shadowBlur = 22;
        ctx.drawImage(image, x + w - 99, y + 19, 74, 74);
        ctx.shadowBlur = 0;
      }
    }
    text(
      ctx,
      m.mmr === null ? "—" : m.mmr.toLocaleString("en-US"),
      x + 22,
      y + 164,
      58,
      WHITE,
      233,
      true,
    );
    text(ctx, "MMR", x + 25, y + 190, 13, MUTED, 225, true);
    const plotX = x + 275,
      plotY = y + 121,
      plotW = w - 303,
      plotH = 57,
      history = m.history;
    if (history.values.length >= 2) {
      const delta = history.delta!;
      text(
        ctx,
        `${delta > 0 ? "+" : ""}${delta} MMR`,
        plotX,
        y + 108,
        19,
        delta > 0 ? "#79e2c2" : delta < 0 ? "#ff9eaf" : MUTED,
        plotW,
        true,
      );
    } else
      text(
        ctx,
        history.values.length ? "Trend pending" : "No history yet",
        plotX,
        y + 108,
        16,
        MUTED,
        plotW,
      );
    ctx.strokeStyle = "#ffffff0c";
    ctx.lineWidth = 1;
    for (let line = 0; line < 3; line++) {
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + (line * plotH) / 2);
      ctx.lineTo(plotX + plotW, plotY + (line * plotH) / 2);
      ctx.stroke();
    }
    const geometry = historyGeometry(history.points, plotW, plotH);
    ctx.beginPath();
    for (const p of geometry) {
      if (p.y === null) continue;
      if (p.join) ctx.lineTo(plotX + p.x, plotY + p.y);
      else ctx.moveTo(plotX + p.x, plotY + p.y);
    }
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    for (const p of geometry) {
      if (p.y === null) continue;
      ctx.beginPath();
      ctx.arc(plotX + p.x, plotY + p.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
    }
    if (history.values.length >= 2)
      text(
        ctx,
        `RANGE ${history.min}–${history.max}`,
        plotX,
        y + 198,
        13,
        MUTED,
        plotW,
      );
    text(
      ctx,
      `BEST SEEN ${m.bestWinStreak === null ? "—" : m.bestWinStreak + "W"}`,
      x + 24,
      y + 210,
      13,
      m.bestWinStreak ? "#f3cb72" : MUTED,
      225,
      true,
    );
    ctx.fillStyle = "#ffffff0d";
    ctx.fillRect(x + 24, y + 216, w - 48, 1);
    text(
      ctx,
      `${m.matches === null ? "—" : m.matches.toLocaleString("en-US")} MATCHES`,
      x + 24,
      y + 245,
      16,
      WHITE,
      140,
      true,
    );
    const streak = m.streak;
    pill(
      ctx,
      streak === null
        ? "STREAK —"
        : streak === 0
          ? "NO STREAK"
          : `${Math.abs(streak)}${streak > 0 ? "W" : "L"} STREAK`,
      x + 165,
      y + 226,
      streak === null || streak === 0
        ? MUTED
        : streak > 0
          ? "#79e2c2"
          : "#ff9eaf",
      133,
    );
    const divX = x + 322,
      divW = w - 346;
    text(
      ctx,
      `DIV ↑ ${m.up === null ? "—" : "+" + m.up}    ↓ ${m.down === null ? "—" : "−" + m.down}`,
      divX,
      y + 243,
      15,
      MUTED,
      divW,
    );
    ctx.fillStyle = "#ffffff12";
    rounded(ctx, divX, y + 253, divW, 4, 2);
    ctx.fill();
    if (m.progress !== null) {
      ctx.fillStyle = m.color;
      rounded(ctx, divX, y + 253, Math.max(4, divW * m.progress), 4, 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "#ffffff0d";
    ctx.lineWidth = 1;
    rounded(ctx, x + 0.5, y + 0.5, w - 1, TILE - 1, 18);
    ctx.stroke();
  }
  const footer = height - 38;
  ctx.fillStyle = "#ffffff12";
  ctx.fillRect(PAD, footer - 24, WIDTH - PAD * 2, 1);
  const times = [
    ...new Set(model.modes.flatMap((m) => m.history.points.map((p) => p.at))),
  ];
  if (times.length >= 2)
    text(
      ctx,
      `${shortDate(Math.min(...times))} → ${shortDate(Math.max(...times))} UTC`,
      PAD,
      footer + 6,
      14,
      MUTED,
      740,
    );
  text(
    ctx,
    model.at ? `UPDATED ${date(model.at)}` : "UPDATE TIME UNAVAILABLE",
    820,
    footer + 6,
    14,
    MUTED,
    WIDTH - 852,
  );
  const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "rank.png",
  });
  attachment.setDescription(
    `${input.name}: ${model.modes.map((m) => `${m.playlist}: ${m.rank}, ${m.mmr ?? "unavailable"} MMR, best seen ${m.bestWinStreak ?? "unknown"} wins`).join("; ")}. Best seen uses reported streaks from retained local observations, not a verified lifetime record. ${model.stale ? "Cached snapshot. " : ""}${model.at ? "Observed " + new Date(model.at).toISOString() : "Observation time unavailable"}.`.slice(
      0,
      1024,
    ),
  );
  return attachment;
}
