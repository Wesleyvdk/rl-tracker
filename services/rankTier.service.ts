export default function getRankTier(mode: string, rating: number) {
  const ranges =
    mode === "Ranked Duel 1v1"
      ? rankRanges1v1
      : mode === "Ranked Doubles 2v2"
      ? rankRanges2v2
      : rankRanges3v3;

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (rating >= range.min && rating <= range.max) {
      if (range.tier === "Supersonic Legend") {
        return {
          tier: range.tier,
          nextMMR: 250,
          prevMMR: rating - ranges[i + 1].max,
        };
      }

      const nextMMR = ranges[i + 1] ? ranges[i - 1].min - rating : null;
      const prevMMR = ranges[i - 1] ? rating - ranges[i + 1].max : null;
      // console.log(
      //   "Next MMR:",
      //   nextMMR,
      //   ranges[i - 1],
      //   ranges[i - 1].min,
      //   rating
      // );
      // console.log(
      //   "Prev MMR:",
      //   prevMMR,
      //   ranges[i + 1],
      //   rating,
      //   ranges[i + 1].max
      // );
      return {
        tier: range.tier,
        nextMMR,
        prevMMR,
      };
    }
  }
  return { tier: "Unranked", nextMMR: null, prevMMR: null };
}

const rankRanges1v1 = [
  { tier: "Supersonic Legend", min: 1342, max: Infinity },
  { tier: "Grand Champion III", min: 1295, max: 1341 },
  { tier: "Grand Champion II", min: 1228, max: 1294 },
  { tier: "Grand Champion I", min: 1168, max: 1227 },
  { tier: "Champion III", min: 1115, max: 1167 },
  { tier: "Champion II", min: 1055, max: 1114 },
  { tier: "Champion I", min: 995, max: 1054 },
  { tier: "Diamond III", min: 815, max: 994 },
  { tier: "Diamond II", min: 755, max: 814 },
  { tier: "Diamond I", min: 675, max: 754 },
  { tier: "Platinum III", min: 635, max: 674 },
  { tier: "Platinum II", min: 575, max: 634 },
  { tier: "Platinum I", min: 515, max: 574 },
  { tier: "Gold III", min: 455, max: 514 },
  { tier: "Gold II", min: 395, max: 454 },
  { tier: "Gold I", min: 335, max: 394 },
  { tier: "Silver III", min: 273, max: 334 },
  { tier: "Silver II", min: 214, max: 272 },
  { tier: "Silver I", min: 156, max: 213 },
  { tier: "Bronze III", min: 44, max: 155 },
  { tier: "Bronze II", min: 0, max: 43 },
  { tier: "Bronze I", min: -100, max: -1 },
];

const rankRanges2v2 = [
  { tier: "Supersonic Legend", min: 1861, max: Infinity },
  { tier: "Grand Champion III", min: 1715, max: 1860 },
  { tier: "Grand Champion II", min: 1575, max: 1714 },
  { tier: "Grand Champion I", min: 1435, max: 1574 },
  { tier: "Champion III", min: 1315, max: 1434 },
  { tier: "Champion II", min: 1195, max: 1314 },
  { tier: "Champion I", min: 1075, max: 1194 },
  { tier: "Diamond III", min: 915, max: 1074 },
  { tier: "Diamond II", min: 835, max: 914 },
  { tier: "Diamond I", min: 773, max: 834 },
  { tier: "Platinum III", min: 714, max: 772 },
  { tier: "Platinum II", min: 655, max: 713 },
  { tier: "Platinum I", min: 595, max: 654 },
  { tier: "Gold III", min: 535, max: 594 },
  { tier: "Gold II", min: 475, max: 534 },
  { tier: "Gold I", min: 415, max: 474 },
  { tier: "Silver III", min: 355, max: 414 },
  { tier: "Silver II", min: 290, max: 354 },
  { tier: "Silver I", min: 231, max: 289 },
  { tier: "Bronze III", min: 166, max: 230 },
  { tier: "Bronze II", min: 100, max: 165 },
  { tier: "Bronze I", min: -100, max: 99 },
];

const rankRanges3v3 = [
  { tier: "Supersonic Legend", min: 1876, max: Infinity },
  { tier: "Grand Champion III", min: 1708, max: 1875 },
  { tier: "Grand Champion II", min: 1575, max: 1707 },
  { tier: "Grand Champion I", min: 1435, max: 1574 },
  { tier: "Champion III", min: 1315, max: 1434 },
  { tier: "Champion II", min: 1195, max: 1314 },
  { tier: "Champion I", min: 1075, max: 1194 },
  { tier: "Diamond III", min: 915, max: 1074 },
  { tier: "Diamond II", min: 835, max: 914 },
  { tier: "Diamond I", min: 775, max: 834 },
  { tier: "Platinum III", min: 715, max: 774 },
  { tier: "Platinum II", min: 655, max: 714 },
  { tier: "Platinum I", min: 595, max: 654 },
  { tier: "Gold III", min: 535, max: 594 },
  { tier: "Gold II", min: 475, max: 534 },
  { tier: "Gold I", min: 415, max: 474 },
  { tier: "Silver III", min: 355, max: 414 },
  { tier: "Silver II", min: 295, max: 354 },
  { tier: "Silver I", min: 226, max: 294 },
  { tier: "Bronze III", min: 168, max: 225 },
  { tier: "Bronze II", min: 88, max: 167 },
  { tier: "Bronze I", min: 44, max: 87 },
];
