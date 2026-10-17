import { Collection, Client } from "discord.js";

export interface RankData {
  mode: string;
  Current: {
    Rating: number;
    Rank: number;
    Percentage: string;
    RankTier: string;
    NextMMR: number | null;
    PrevMMR: number | null;
  };
  Best: {
    Rating: number;
    Season: number;
  };
}

export interface PeakRating {
  [key: string]: RankData;
}

export interface Player {
  name: string;
  matches: number;
  wins: number;
  loss: number;
  streak: number;
}

export interface Command {
  data: CommandData;
  execute: (client: Client, interaction: any) => void;
  autocomplete?: (interaction: any) => Promise<void>;
  // Add other properties as needed
}

interface CommandData {
  options: any[];
  name: string;
  name_localizations: Collection<string, string>;
  description: string;
  description_localizations: Collection<string, string>;
  default_permission: any;
  default_member_permissions: any;
  dm_permission: any;
  nsfw: boolean;
}

// export interface PlayerData {
//   name: string;
//   modes: GameMode[];
// }

export interface PlayerData {
  name: string;
  ranks: ParsedRanks;
}

interface GameMode {
  name: string;
  rank: string;
  //   division: string;
  mmr: number;
  nextMMR: number | null;
  prevMMR: number | null;
  icon: string;
}

export interface RankInfo {
  rank: string;
  division: string;
  rating: number | null;
  streak: string;
  nextMMR: number | null;
  prevMMR: number | null;
  matches: number | null;
  icon: string;
}

export interface ParsedRanks {
  "Reward Level": string;
  "Ranked Duel 1v1": RankInfo;
  "Ranked Doubles 2v2": RankInfo;
  "Ranked Standard 3v3": RankInfo;
  "Tournament Matches": RankInfo;
}

export interface SeasonData {
  season: string;
  seasonId?: number;
  noMatches?: boolean;
  unavailable?: boolean;
  fetchedAt?: number;
  totalMatches?: number | null; // Total matches played in this season (sum of all playlists)
  playlists: {
    [key: string]: {
      rank: string;
      matches: number | null;
    };
  };
}

export interface AverageStats {
  playlist: string;
  averageMatches: number | null;
  averageRankTier: number; // Numeric representation of rank
  averageRankName: string; // Approximate rank name
}

export interface SeasonStatsResult {
  fetchedAt?: number;
  stale?: boolean;
  extractorVersion?: number;
  partial?: boolean;
  refreshIncomplete?: boolean;
  coverage?: {
    available: number;
    requested: { id: number; label: string }[];
    completed: number[];
    missing: number[];
    unavailable: number[];
  };
  seasonData: SeasonData[];
  averageStats: AverageStats[];
  failureReason?:
    | "invalid_profile_input"
    | "cloudflare_blocked"
    | "profile_not_found"
    | "table_unavailable"
    | "timeout"
    | "fetch_failed";
}
