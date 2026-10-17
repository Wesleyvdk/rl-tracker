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
  rounded,
  date,
  shortDate,
  icon,
  createCardStyle,
  shortMode,
} from "./cardTheme.service";
export function rankCardHeight(count: number) {
  return TOP + Math.ceil(Math.max(8, count) / 2) * (TILE + GAP) + 60;
}
export default async function generateRankCard(
  input: RankCardInput,
): Promise<AttachmentBuilder> {
  const model = makeRankCardModel(input),
    height = rankCardHeight(model.modes.length);
  const style = createCardStyle(input.theme),
    { text, pill, background } = style,
    {
      text: WHITE,
      muted: MUTED,
      positive,
      negative,
      warning,
      border,
    } = style.colors;
  const canvas = Canvas.createCanvas(WIDTH, height),
    ctx = canvas.getContext("2d");
  background(ctx, WIDTH, height);
  style.header(ctx);
  text(
    ctx,
    input.preview
      ? "DESIGN PREVIEW · SYNTHETIC HISTORY"
      : `PLAYER REPORT · ${(input.platform || "ROCKET LEAGUE").toUpperCase()}`,
    PAD + 19,
    65,
    15,
    input.preview ? warning : MUTED,
    880,
    true,
  );
  text(ctx, input.name, PAD + 17, 130, 54, WHITE, 880, true);
  text(
    ctx,
    input.rewardLevel || "Reward level unavailable",
    PAD + 19,
    168,
    18,
    MUTED,
    860,
  );
  await style.brand(ctx, 1025, 65, 205, 20);
  pill(
    ctx,
    model.at ? (model.stale ? "CACHED" : "UPDATED") : "TIME UNAVAILABLE",
    1025,
    92,
    model.stale || !model.at ? warning : positive,
    223,
  );
  text(
    ctx,
    `${model.available} / ${model.modes.length} MODES AVAILABLE`,
    1025,
    159,
    15,
    MUTED,
    223,
  );
  const w = (WIDTH - PAD * 2 - GAP) / 2;
  for (const [i, source] of model.modes.entries()) {
    const m = { ...source, color: style.rankColor(source.color) };
    const x = PAD + (i % 2) * (w + GAP),
      y = TOP + Math.floor(i / 2) * (TILE + GAP);
    style.surface(ctx, x, y, w, TILE, m.color, true);
    ctx.save();
    rounded(ctx, x, y, w, TILE, style.theme.radius);
    ctx.clip();
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
    text(ctx, shortMode(m.playlist), x + 59, y + 37, 24, WHITE, w - 167, true);
    text(ctx, m.rank, x + 24, y + 71, 22, m.color, w - 132, true);
    text(ctx, m.division, x + 24, y + 97, 17, MUTED, 230);
    if (m.icon !== null) {
      const image = await icon(m.icon);
      if (image) {
        ctx.shadowColor = m.color + "70";
        ctx.shadowBlur = style.theme.neon ? 22 : 0;
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
        delta > 0 ? positive : delta < 0 ? negative : MUTED,
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
    ctx.strokeStyle = border;
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
      `BEST STREAK ${m.bestWinStreak === null ? "—" : m.bestWinStreak + "W"}`,
      x + 24,
      y + 210,
      13,
      m.bestWinStreak ? warning : MUTED,
      225,
      true,
    );
    ctx.fillStyle = border;
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
          ? positive
          : negative,
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
    ctx.fillStyle = border;
    rounded(ctx, divX, y + 253, divW, 4, 2);
    ctx.fill();
    if (m.progress !== null) {
      ctx.fillStyle = m.color;
      rounded(ctx, divX, y + 253, Math.max(4, divW * m.progress), 4, 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    rounded(ctx, x + 0.5, y + 0.5, w - 1, TILE - 1, style.theme.radius);
    ctx.stroke();
  }
  style.footer(ctx, height);
  const footer = height - 38;
  ctx.fillStyle = border;
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
    `${input.name}: ${model.modes.map((m) => `${m.playlist}: ${m.rank}, ${m.mmr ?? "unavailable"} MMR, best streak ${m.bestWinStreak ?? "unknown"} wins`).join("; ")}. Best streak uses reported streaks from retained local observations, not a verified lifetime record. ${model.stale ? "Cached snapshot. " : ""}${model.at ? "Observed " + new Date(model.at).toISOString() : "Observation time unavailable"}.`.slice(
      0,
      1024,
    ),
  );
  return attachment;
}
