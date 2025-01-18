export default async function rankEntries(
  rawRanks: string[]
): Promise<string[]> {
  const rankEntries = rawRanks[0].match(/Ranked [a-zA-Z0-9 ]+.*?(?=Ranked|$)/g);
  rankEntries!.shift();
  return rankEntries || [];
}
