export interface Game {
  id: string;
  name: string;
  description: string;
  icon: string;
  thumbnail?: string;
  minBet: number;
  maxBet: number;
  category: 'classic' | 'card' | 'luck' | 'skill';
  difficulty: 'easy' | 'medium' | 'hard';
  rtp: number; // Return to Player percentage
  isNew?: boolean;
  isPopular?: boolean;
}

export interface GameStats {
  totalWagered: number;
  totalWon: number;
  gamesPlayed: number;
  biggestWin: number;
  lastPlayed: Date;
}

export interface PlayerStats {
  [gameId: string]: GameStats;
}
