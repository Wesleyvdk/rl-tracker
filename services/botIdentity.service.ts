import { ActivityType, type PresenceData } from "discord.js";

export const botDescription =
  "Your Rocket League climb, right in Discord. Check ranks, MMR trends, win streaks and season history. Compare server leaderboards and make your stats your own with personal and organization themes. By Aylian Studios.";

export const botTags = [
  "Rocket League",
  "Statistics",
  "Leaderboards",
  "Gaming",
  "Esports",
];

export function botPresence(): PresenceData {
  return {
    status: "online",
    activities: [
      { name: "Rocket League ranks • /rank", type: ActivityType.Watching },
    ],
  };
}
