import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import generateRankCard from "../services/generateRankCard.service";
import { parseProfileHtml } from "../services/profileParser.service";
import type { RankCardInput } from "../services/rankCardModel.service";
const args = process.argv.slice(2),
  inputPath = args[args.indexOf("--input") + 1];
let input: RankCardInput;
if (args.includes("--input"))
  input = JSON.parse(readFileSync(inputPath, "utf8"));
else {
  const ranks = parseProfileHtml(
    readFileSync(
      new URL("../tests/fixtures/rank-table.html", import.meta.url),
      "utf8",
    ),
  ).tableData!;
  const at = Date.now();
  input = {
    name: "Aether",
    ranks,
    rewardLevel: "Champion rewards · example",
    platform: "Epic Games",
    fetchedAt: at,
    preview: true,
    history: {},
  };
  for (const [i, row] of ranks.entries()) {
    input.history![row.playlist] = Array.from({ length: 48 }, (_, n) => ({
      at: at - (47 - n) * 3600000,
      mmr:
        n === 22 && i === 3
          ? null
          : Math.round(
              row.mmr! +
                (Math.sin(n * 0.6 + i) * 10 + (47 - n) * (i % 2 ? 0.8 : -0.9)) *
                  (n === 47 ? 0 : 1),
            ),
    }));
  }
}
const output = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : "benchmark/results/rank-card-style/design-preview.png";
mkdirSync(dirname(output), { recursive: true });
const image = await generateRankCard(input);
writeFileSync(output, image.attachment as Buffer);
console.log(output);
