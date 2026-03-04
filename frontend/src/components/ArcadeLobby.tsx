import { useState, useMemo } from 'react';
import { AVAILABLE_GAMES, GAME_CATEGORIES } from '../constants/games';
import { Game } from '../types/games';
import { Coins, Trophy, Star, TrendingUp, Sparkles } from 'lucide-react';

interface ArcadeLobbyProps {
  onSelectGame: (game: Game) => void;
  walletConnected: boolean;
  balanceCkb?: string;
  walletAddress?: string;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
}

export function ArcadeLobby({ onSelectGame, walletConnected, balanceCkb, walletAddress, onConnectWallet, onDisconnectWallet }: ArcadeLobbyProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGames = useMemo(() => {
    let games = AVAILABLE_GAMES;

    // Filter by category
    if (selectedCategory !== 'all') {
      games = games.filter(game => game.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      games = games.filter(game =>
        game.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        game.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return games;
  }, [selectedCategory, searchTerm]);

  const popularGames = AVAILABLE_GAMES.filter(game => game.isPopular);
  const newGames = AVAILABLE_GAMES.filter(game => game.isNew);

  return (
    <div className="min-h-screen w-full relative flex flex-col pb-20 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Navigation Bar */}
      <nav className="w-full max-w-7xl mx-auto flex justify-between items-center py-6 px-6 z-50">
        <div className="flex items-center gap-3 select-none">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.3)]">
            <Coins className="text-white h-6 w-6" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black italic tracking-tighter text-white">
              CKB <span className="text-purple-400">ARCADE</span>
            </span>
            <span className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase">Testnet Beta</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {walletConnected && balanceCkb ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onConnectWallet}
                className="glass-button px-5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-bold tracking-wide hover:bg-white/5"
                disabled={!onConnectWallet}
              >
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
                <div className="flex flex-col leading-tight text-left">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Balance</span>
                  <span className="text-sm font-mono text-white">{balanceCkb} CKB</span>
                </div>
                {walletAddress && (
                  <span className="hidden sm:inline text-xs font-mono text-gray-300 max-w-[160px] truncate">
                    {`${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`}
                  </span>
                )}
              </button>

              <button
                onClick={onDisconnectWallet}
                className="px-5 py-2.5 rounded-xl font-black text-sm transition-all border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                disabled={!onDisconnectWallet}
              >
                DISCONNECT
              </button>
            </div>
          ) : (
            <button
              onClick={onConnectWallet}
              className="bg-purple-500 hover:bg-purple-400 text-white px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!onConnectWallet}
            >
              CONNECT WALLET
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 flex flex-col gap-8 mt-6">

        {/* Hero Section */}
        <div className="text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold font-mono text-purple-400 mb-2 shadow-lg backdrop-blur-sm">
            <Sparkles className="w-3 h-3" /> MULTIPLE GAMES • ONE WALLET
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter leading-none drop-shadow-2xl pr-2">
            CKB <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 animate-[text-shimmer_2s_linear_infinite]">ARCADE</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
            Play multiple exciting arcade games with CKB testnet tokens. Connect your wallet and start winning!
          </p>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {GAME_CATEGORIES.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${selectedCategory === category.id
                  ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
              >
                <span className="mr-2">{category.icon}</span>
                {category.name}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search games..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 transition-colors"
          />
        </div>

        {/* Featured Games */}
        {(selectedCategory === 'all' && !searchTerm) && (
          <div className="space-y-8">
            {/* Popular Games */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-yellow-400" />
                <h2 className="text-2xl font-bold text-white">Popular Games</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {popularGames.map(game => (
                  <GameCard key={game.id} game={game} onSelectGame={onSelectGame} />
                ))}
              </div>
            </div>

            {/* New Games */}
            {newGames.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-green-400" />
                  <h2 className="text-2xl font-bold text-white">New Games</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {newGames.map(game => (
                    <GameCard key={game.id} game={game} onSelectGame={onSelectGame} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* All Games Grid */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">
            {selectedCategory === 'all' ? 'All Games' : GAME_CATEGORIES.find(c => c.id === selectedCategory)?.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGames.map(game => (
              <GameCard key={game.id} game={game} onSelectGame={onSelectGame} />
            ))}
          </div>
        </div>

        {filteredGames.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No games found matching your criteria.</p>
          </div>
        )}
      </main>
    </div>
  );
}

interface GameCardProps {
  game: Game;
  onSelectGame: (game: Game) => void;
}

function GameCard({ game, onSelectGame }: GameCardProps) {
  return (
    <div
      className="group relative bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-6 hover:border-purple-400/50 transition-all duration-300 cursor-pointer hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] hover:scale-[1.02]"
      onClick={() => onSelectGame(game)}
    >
      {/* Game Thumbnail or Icon */}
      <div className="mb-4 text-center group-hover:scale-105 transition-transform">
        {game.thumbnail ? (
          <img
            src={game.thumbnail}
            alt={game.name}
            className="w-full h-32 object-cover rounded-xl"
            onError={(e) => {
              // Fallback to icon if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`text-6xl ${game.thumbnail ? 'hidden' : ''}`}>
          {game.icon}
        </div>
      </div>

      {/* Game Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors">
            {game.name}
          </h3>
          <div className="flex gap-1">
            {game.isNew && (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full">
                NEW
              </span>
            )}
            {game.isPopular && (
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full">
                HOT
              </span>
            )}
          </div>
        </div>

        <p className="text-gray-400 text-sm line-clamp-2">
          {game.description}
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            Min: <span className="text-white font-mono">{game.minBet} CKB</span>
          </span>
          <span className="text-gray-500">
            Max: <span className="text-white font-mono">{game.maxBet} CKB</span>
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-400">RTP: {game.rtp}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-bold rounded">
              {game.difficulty.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-purple-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white font-bold text-lg">PLAY NOW</div>
      </div>
    </div>
  );
}
