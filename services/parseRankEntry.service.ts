export default function parseRankEntry(
  rank: string
): { [key: string]: any } | null {
  const result: { [key: string]: any } = {};

  // Find and extract mode
  const modeEndIndex = rank.indexOf("Current");
  const mode = rank.substring(0, modeEndIndex).trim();
  result[mode] = {};

  // Extract 'Current' stats
  const currentStartIndex = modeEndIndex + "Current".length;
  const currentEndIndex = rank.indexOf("Best", currentStartIndex);

  const currentSection = rank
    .substring(currentStartIndex, currentEndIndex)
    .trim();
  const currentParts = currentSection.split(/[#•]/).map((part) => part.trim());

  const currentRating = parseInt(currentParts[0].replace(/,/g, ""), 10);
  const currentRank = parseInt(currentParts[1].replace(/,/g, ""), 10);
  const currentPercentage = currentParts[2].replace("Top", "").trim() + "%";

  result[mode] = { mode: mode };
  result[mode]["Current"] = {
    Rating: currentRating,
    Rank: currentRank,
    Percentage: currentPercentage,
  };

  // Extract 'Best' stats
  const bestSection = rank.substring(currentEndIndex + "Best".length).trim();
  const bestParts = bestSection.split("Season").map((part) => part.trim());

  const bestRating = parseInt(bestParts[0].replace(/,/g, ""), 10);
  const bestSeason = parseInt(bestParts[1], 10);

  result[mode]["Best"] = {
    Rating: bestRating,
    Season: bestSeason,
  };

  return result;
}
