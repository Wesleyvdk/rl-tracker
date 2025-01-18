export default function parseRewardLevel(rawRanks: string[]) {
  let rewardLevel = "";
  rawRanks.forEach((rawRank) => {
    // Parse Reward Level
    const rewardStart = rawRank.indexOf("Reward Level");
    const rewardEnd = rawRank.indexOf("Top", rewardStart);
    if (rewardStart !== -1 && rewardEnd !== -1) {
      rewardLevel = rawRank
        .substring(rewardStart + "Reward Level".length, rewardEnd)
        .trim();
    }
  });
  return rewardLevel;
}
