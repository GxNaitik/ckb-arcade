import { ccc } from '@ckb-ccc/connector-react';
import { Coins, ArrowLeft } from 'lucide-react';
import { ArcadeLobby } from './components/ArcadeLobby';
import { SpinWheel } from './components/games/SpinWheel';
import { DiceRoll } from './components/games/DiceRoll';
import { CoinFlip } from './components/games/CoinFlip';
import { NumberGuess } from './components/games/NumberGuess';
import { EndlessRunner } from './components/games/EndlessRunner/EndlessRunner';
import { useEffect, useMemo, useState } from 'react';
import { Game } from './types/games';

// Game Address
const DEFAULT_GAME_ADDRESS = 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2dq0e9th5maw4k2vhk7nz4wdydrlq3cugzmv8pp';

type WalletLike = {
  address?: string;
  icon?: string;
};

function App({
  wallet,
  openWallet,
  disconnectWallet,
  balanceCkb,
  lastTxHash,
  onTx,
  signer,
  gameAddress,
  gameAddressValid,
}: {
  wallet?: WalletLike;
  openWallet?: () => void;
  disconnectWallet?: () => void;
  balanceCkb?: string;
  lastTxHash?: string;
  onTx?: (txHash: string) => void;
  signer?: ReturnType<typeof ccc.useSigner> | null;
  gameAddress: string;
  gameAddressValid: boolean;
}) {
  const address = wallet?.address ?? '';
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const explorerTxUrl = lastTxHash ? `https://pudge.explorer.nervos.org/transaction/${lastTxHash}` : '';

  const renderGame = () => {
    if (!currentGame) return null;

    const gameProps = {
      gameAddress,
      walletAddress: address,
      onConnect: openWallet,
      signer,
      onTx,
      onWin: (winner: string) => console.log(`Winner: ${winner}`),
    };

    switch (currentGame.id) {
      case 'spin-wheel':
        return <SpinWheel {...gameProps} />;
      case 'dice-roll':
        return <DiceRoll {...gameProps} />;
      case 'coin-flip':
        return <CoinFlip {...gameProps} />;
      case 'number-guess':
        return <NumberGuess {...gameProps} />;
      case 'endless-runner':
        return <EndlessRunner {...gameProps} />;
      default:
        return null;
    }
  };

  const handleBackToLobby = () => {
    setCurrentGame(null);
  };

  if (currentGame) {
    return (
      <div className="min-h-screen w-full relative flex flex-col pb-20 overflow-x-hidden">
        {/* Dynamic Background */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] animate-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/5 rounded-full blur-[120px]" />
        </div>

        {/* Navigation Bar */}
        <nav className="w-full max-w-6xl mx-auto flex justify-between items-center py-6 px-6 z-50">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToLobby}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-3 select-none">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-green-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.3)]">
                <Coins className="text-black h-6 w-6" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-black italic tracking-tighter text-white">
                  {currentGame.name}
                </span>
                <span className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase">Testnet Beta</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {wallet ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={openWallet}
                  className="glass-button px-5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-bold tracking-wide hover:bg-white/5"
                  disabled={!openWallet}
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
                  <div className="flex flex-col leading-tight text-left">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Balance</span>
                    <span className="text-sm font-mono text-white">{balanceCkb ?? '--'} CKB</span>
                  </div>
                  <span className="hidden sm:inline text-xs font-mono text-gray-300 max-w-[160px] truncate">
                    {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Connected'}
                  </span>
                </button>

                <button
                  onClick={disconnectWallet}
                  className="px-5 py-2.5 rounded-xl font-black text-sm transition-all border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                  disabled={!disconnectWallet}
                >
                  DISCONNECT
                </button>
              </div>
            ) : (
              <button
                onClick={openWallet}
                className="bg-primary text-black hover:bg-green-400 px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] hover:shadow-[0_0_30px_rgba(57,255,20,0.5)] transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!openWallet}
              >
                CONNECT WALLET
              </button>
            )}
          </div>
        </nav>

        {/* Game Content */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 flex flex-col items-center mt-6">
          {!gameAddressValid && (
            <div className="w-full max-w-4xl mb-6">
              <div className="glass-panel p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-sm text-gray-200">
                Game address is invalid. Update it to a valid testnet address (starts with <span className="font-mono">ckt1</span>) before placing bets.
              </div>
            </div>
          )}

          {renderGame()}

          {lastTxHash && (
            <div className="w-full max-w-4xl text-left mt-8">
              <div className="glass-panel p-4 rounded-2xl flex flex-col gap-2">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Last Bet Transaction</div>
                <a className="text-sm font-mono text-primary break-all" href={explorerTxUrl} target="_blank" rel="noreferrer">
                  {lastTxHash}
                </a>
              </div>
            </div>
          )}
        </main>

        <footer className="w-full text-center py-8 text-gray-700 text-sm mt-12">
          {gameAddress && (
            <div className="mt-2 text-[11px] text-gray-600">
              Game address:{' '}
              <a
                className="font-mono text-gray-500 hover:text-primary transition-colors"
                href={`https://testnet.explorer.nervos.org/address/${gameAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                {gameAddress}
              </a>
              <div>&copy; 2024 CKB Arcade. Deployed on Nervos Testnet.</div>
            </div>
          )}
        </footer>
      </div>
    );
  }

  // Show Arcade Lobby
  return (
    <ArcadeLobby
      onSelectGame={setCurrentGame}
      walletConnected={Boolean(wallet)}
      balanceCkb={balanceCkb}
      walletAddress={address}
      onConnectWallet={openWallet}
      onDisconnectWallet={disconnectWallet}
    />
  );
}

export function AppWithCcc() {
  const { wallet, open, disconnect, client } = ccc.useCcc();
  const signer = ccc.useSigner();

  const [address, setAddress] = useState<string>('');
  const [balanceCkb, setBalanceCkb] = useState<string>('');
  const [lastTxHash, setLastTxHash] = useState<string>('');
  const [houseAddress, setHouseAddress] = useState<string>('');
  const [houseAddressError, setHouseAddressError] = useState<string>('');
  const envGameAddress = import.meta.env.VITE_GAME_ADDRESS || DEFAULT_GAME_ADDRESS;
  const gameAddress = houseAddress || envGameAddress;
  const [gameAddressValid, setGameAddressValid] = useState<boolean>(true);

  const walletForUi: WalletLike | undefined = useMemo(() => {
    if (!wallet) return undefined;
    const maybeWallet = wallet as unknown as { icon?: string };
    return { icon: maybeWallet.icon, address };
  }, [wallet, address]);

  const openWallet = useMemo(() => {
    return () => {
      void open();
    };
  }, [open]);

  const disconnectWallet = useMemo(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    if (!signer) {
      setAddress('');
      setBalanceCkb('');
      return;
    }
    (async () => {
      const addr = await signer.getRecommendedAddress();
      setAddress(addr);
      const capacity = await signer.getBalance();
      setBalanceCkb(ccc.fixedPointToString(capacity));
    })();
  }, [signer]);

  useEffect(() => {
    if (!signer) return;
    if (!lastTxHash) return;
    (async () => {
      const capacity = await signer.getBalance();
      setBalanceCkb(ccc.fixedPointToString(capacity));
    })();
  }, [signer, lastTxHash]);

  // API base URL from environment variable
  const API_BASE = import.meta.env.VITE_API_BASE || '';

  useEffect(() => {
    (async () => {
      // Skip if no API base URL is set (e.g., in development with local backend)
      if (!API_BASE) {
        console.log('No API base URL set, using default game address');
        return;
      }

      try {
        const headers: HeadersInit = {};
        const apiKey = import.meta.env.VITE_PAYOUT_API_KEY;

        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }

        const resp = await fetch(`${API_BASE}/api/house`, { headers });

        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }

        const json = await resp.json();

        if (typeof json.address === 'string' && json.address.startsWith('ckt1')) {
          setHouseAddress(json.address);
          setHouseAddressError('');
          console.log('Using house address from API:', json.address);
        } else {
          throw new Error('Invalid house address format from backend');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Failed to fetch house address, using default:', msg);
        // Silently fall back to default address
        setHouseAddressError('');
      }
    })();
  }, [API_BASE]);

  useEffect(() => {
    (async () => {
      try {
        console.log('Validating address:', gameAddress);
        console.log('Client:', client);

        // Basic format check first
        if (!gameAddress || !gameAddress.startsWith('ckt1')) {
          throw new Error('Address does not start with ckt1');
        }

        // Try full validation if client is available
        if (client) {
          await ccc.Address.fromString(gameAddress, client);
        }

        console.log('Address validation passed');
        setGameAddressValid(true);
      } catch (e) {
        console.error('Address validation failed:', e);
        setGameAddressValid(false);
      }
    })();
  }, [client, gameAddress]);

  return (
    <App
      wallet={walletForUi}
      openWallet={openWallet}
      disconnectWallet={disconnectWallet}
      balanceCkb={balanceCkb}
      lastTxHash={lastTxHash}
      onTx={setLastTxHash}
      signer={signer}
      gameAddress={gameAddress}
      gameAddressValid={gameAddressValid && !houseAddressError}
    />
  );
}

export default App;
