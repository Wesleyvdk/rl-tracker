import { ActivityType, type PresenceData } from "discord.js";

export const botDescription = `by Aylian Studios
https://aylian-studios.com/

for support:
https://discord.gg/4NqvbCPbQV`;

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
