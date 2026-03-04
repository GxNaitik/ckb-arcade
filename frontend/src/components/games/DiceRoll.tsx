import { useState, useEffect } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { Loader2, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Trophy, Frown, Zap } from 'lucide-react';

// Dice rolling sound effect
const playDiceRollSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Create multiple short noise bursts to simulate dice shaking
    for (let i = 0; i < 8; i++) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150 + Math.random() * 100, audioContext.currentTime + i * 0.15);

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.1);

      oscillator.start(audioContext.currentTime + i * 0.15);
      oscillator.stop(audioContext.currentTime + i * 0.15 + 0.1);
    }
  } catch (e) {
    console.log('Audio not supported');
  }
};

// Win sound effect
const playWinSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.3);
      oscillator.start(audioContext.currentTime + i * 0.1);
      oscillator.stop(audioContext.currentTime + i * 0.1 + 0.3);
    });
  } catch (e) {
    console.log('Audio not supported');
  }
};

interface DiceRollProps {
  gameAddress: string;
  walletAddress?: string;
  onConnect?: () => void;
  signer?: ReturnType<typeof ccc.useSigner> | null;
  onTx?: (txHash: string) => void;
  onWin: (winner: string) => void;
}

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

function hexByteLength(hex: string): number {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Math.ceil(h.length / 2);
}

function scriptOccupiedBytes(script: ccc.Script): number {
  return 32 + 1 + hexByteLength(script.args);
}

function minCellCapacityCkb({ lock, type, dataHex }: { lock: ccc.Script; type?: ccc.Script; dataHex: string }): number {
  const dataBytes = hexByteLength(dataHex);
  const lockBytes = scriptOccupiedBytes(lock);
  const typeBytes = type ? scriptOccupiedBytes(type) : 0;
  const occupiedBytes = 8 + lockBytes + typeBytes + dataBytes;
  return occupiedBytes;
}

export function DiceRoll({
  gameAddress,
  walletAddress,
  onConnect,
  signer,
  onTx,
  onWin,
}: DiceRollProps) {
  const isConnected = Boolean(walletAddress);
  const [errorText, setErrorText] = useState<string>('');
  const [payoutTxHash, setPayoutTxHash] = useState<string>('');
  const [payoutAmountCkb, setPayoutAmountCkb] = useState<number | null>(null);

  const [isRolling, setIsRolling] = useState(false);
  const [playerDice, setPlayerDice] = useState<number>(1);
  const [houseDice, setHouseDice] = useState<number>(1);
  const [selectedBet, setSelectedBet] = useState<'higher' | 'lower' | 'equal'>('higher');
  const [betAmount, setBetAmount] = useState<number>(50);
  const [status, setStatus] = useState<'idle' | 'rolling' | 'success' | 'lost' | 'error'>('idle');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    console.log("Dice Roll game initialized at:", gameAddress);
  }, [gameAddress]);

  const handleRoll = async () => {
    if (isRolling) return;
    if (!isConnected) {
      onConnect?.();
      return;
    }
    if (!signer) {
      onConnect?.();
      return;
    }

    try {
      setIsRolling(true);
      setStatus('rolling');
      setShowModal(false);
      setErrorText('');
      setPayoutTxHash('');
      setPayoutAmountCkb(null);

      let toLock: ccc.Script;
      try {
        ({ script: toLock } = await ccc.Address.fromString(gameAddress, signer.client));
      } catch {
        setStatus('error');
        setErrorText(
          `Invalid game address. Please set a valid CKB testnet address (starts with ckt1...). Received: ${gameAddress}`,
        );
        setShowModal(true);
        return;
      }

      const outputDataHex = '0x';
      const minBetCkb = minCellCapacityCkb({ lock: toLock, dataHex: outputDataHex });
      const finalBetAmount = Math.max(betAmount, minBetCkb).toString();
      const tx = ccc.Transaction.from({
        outputs: [{ lock: toLock }],
        outputsData: [outputDataHex],
      });
      tx.outputs.forEach((output) => {
        output.capacity = ccc.fixedPointFrom(finalBetAmount);
      });
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 2000); // Increased fee rate to avoid RBF issues
      const txHash = await signer.sendTransaction(tx);
      onTx?.(txHash);

      // Animate dice rolling
      playDiceRollSound();
      let rollCount = 0;
      const rollInterval = setInterval(() => {
        setPlayerDice(Math.floor(Math.random() * 6) + 1);
        setHouseDice(Math.floor(Math.random() * 6) + 1);
        rollCount++;
        if (rollCount > 20) {
          clearInterval(rollInterval);
        }
      }, 100);

      // Wait for animation
      await new Promise(r => setTimeout(r, 2500));

      // Final dice results
      const finalPlayerDice = Math.floor(Math.random() * 6) + 1;
      const finalHouseDice = Math.floor(Math.random() * 6) + 1;
      setPlayerDice(finalPlayerDice);
      setHouseDice(finalHouseDice);

      // Determine winner
      let won = false;
      if (selectedBet === 'higher' && finalPlayerDice > finalHouseDice) {
        won = true;
      } else if (selectedBet === 'lower' && finalPlayerDice < finalHouseDice) {
        won = true;
      } else if (selectedBet === 'equal' && finalPlayerDice === finalHouseDice) {
        won = true;
      }

      if (won) {
        setStatus('success');
        onWin(walletAddress ?? '');
        playWinSound();
        const winAmount = betAmount * 2; // Double the bet for winning

        try {
          const API_BASE = import.meta.env.VITE_API_BASE || '';
          const payoutApiKey = import.meta.env.VITE_PAYOUT_API_KEY;

          if (!API_BASE) {
            console.log('No API base URL set, skipping payout');
            setPayoutAmountCkb(winAmount);
            setPayoutTxHash('demo-mode');
            // Don't return here - continue to show success modal
          } else {
            const resp = await fetch(`${API_BASE}/api/payout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(payoutApiKey ? { 'x-api-key': payoutApiKey } : {}),
              },
              body: JSON.stringify({
                toAddress: walletAddress,
                amountCkb: winAmount,
                betTxHash: txHash,
              }),
            });

            if (!resp.ok) {
              let errorData;
              try {
                errorData = await resp.json();
              } catch (e) {
                throw new Error(`Payout failed with status ${resp.status}: ${resp.statusText}`);
              }

              if (typeof errorData.shortfallCkb === 'number') {
                const bal = typeof errorData.houseBalanceCkb === 'string' ? errorData.houseBalanceCkb : undefined;
                const houseAddr = typeof errorData.houseAddress === 'string' ? errorData.houseAddress : undefined;
                const requested = typeof errorData.requestedAmountCkb === 'number' ? errorData.requestedAmountCkb : undefined;
                const required = typeof errorData.requiredPayoutCkb === 'number' ? errorData.requiredPayoutCkb : undefined;
                const parts = [
                  `House wallet is underfunded. Shortfall: ${errorData.shortfallCkb} CKB.`,
                  requested !== undefined && required !== undefined && required !== requested
                    ? `Note: payout requires at least ${required} CKB (min cell capacity), even though this win is ${requested} CKB.`
                    : undefined,
                  bal ? `House balance: ${bal} CKB.` : undefined,
                  houseAddr ? `House address: ${houseAddr}` : undefined,
                ].filter(Boolean);
                throw new Error(parts.join(' '));
              }

              throw new Error(errorData.message || errorData.error || `Payout failed with status ${resp.status}`);
            }

            const json = await resp.json();
            if (json.payoutTxHash) {
              setPayoutTxHash(json.payoutTxHash);
            }
            if (typeof json.amountCkb === 'number') {
              setPayoutAmountCkb(json.amountCkb);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isFetchFailed = /fetch failed|Failed to fetch|Unexpected response format|payout service is not available/i.test(msg);
          setErrorText(
            isFetchFailed
              ? 'Payout service is not available in this demo. To test payouts, please run the backend server locally.'
              : `Payout failed: ${msg}`,
          );
        }
      } else {
        setStatus('lost');
      }

      setShowModal(true);
    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorText(error instanceof Error ? error.message : 'Transaction failed');
      setShowModal(true);
    } finally {
      setIsRolling(false);
    }
  };

  const PlayerDiceIcon = DICE_ICONS[playerDice - 1];
  const HouseDiceIcon = DICE_ICONS[houseDice - 1];

  return (
    <div className="flex flex-col items-center gap-8 relative z-10 w-full py-4">
      <div className="text-center space-y-2">
        <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tight drop-shadow-2xl pr-2">CKB <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-orange-400 to-red-400">DICE ROLL</span></h2>
        <p className="text-gray-400">Roll the dice and predict your luck!</p>
      </div>

      {/* Dice Display */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <div className="text-sm text-gray-400 mb-2">Your Dice</div>
          <div className={`w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-xl ${isRolling ? 'animate-bounce' : ''}`}>
            <PlayerDiceIcon className="w-16 h-16 text-white" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{playerDice}</div>
        </div>

        <div className="text-2xl font-bold text-gray-400">VS</div>

        <div className="text-center">
          <div className="text-sm text-gray-400 mb-2">House Dice</div>
          <div className={`w-24 h-24 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-xl ${isRolling ? 'animate-bounce' : ''}`}>
            <HouseDiceIcon className="w-16 h-16 text-white" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{houseDice}</div>
        </div>
      </div>

      {/* Betting Controls */}
      <div className="w-full max-w-md space-y-4">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Your Prediction</label>
          <div className="grid grid-cols-3 gap-2">
            {(['higher', 'lower', 'equal'] as const).map((bet) => (
              <button
                key={bet}
                onClick={() => setSelectedBet(bet)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${selectedBet === bet
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
              >
                {bet.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (CKB)</label>
          <div className="grid grid-cols-3 gap-2">
            {[50, 100, 200].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${betAmount === amount
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
              >
                {amount} CKB
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Roll Button */}
      <button
        onClick={handleRoll}
        disabled={isRolling}
        className={`
          relative group overflow-hidden rounded-2xl px-12 py-4 font-black text-2xl uppercase tracking-widest transition-all
          ${!isConnected
            ? 'bg-gray-800 text-gray-300 cursor-pointer border border-gray-700'
            : isRolling
              ? 'bg-gray-900 text-yellow-500 cursor-wait border border-yellow-900'
              : 'bg-purple-500 text-white hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(168,85,247,0.4)] border border-purple-400'
          }
        `}
      >
        {isRolling ? (
          <Loader2 className="animate-spin w-8 h-8" />
        ) : (
          <span className="relative z-10 flex items-center gap-2">
            {isConnected ? (
              <span className="flex flex-col items-center leading-none">
                <span className="flex items-center gap-2">
                  ROLL <Zap className="w-5 h-5 fill-current" />
                </span>
                <span className="mt-1 text-[11px] font-mono font-bold text-white/70">({betAmount} CKB)</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                CONNECT <Zap className="w-5 h-5 fill-current" />
              </span>
            )}
          </span>
        )}

        {!isRolling && isConnected && (
          <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12" />
        )}
      </button>

      {/* Result Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setShowModal(false)}
          />

          <div className="relative z-10 w-full max-w-sm animate-in zoom-in-50 duration-500">
            {status === 'error' ? (
              <div className="bg-[#1a1a1a] border border-red-500/30 rounded-[2rem] p-1 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                <div className="relative bg-black/50 rounded-[1.8rem] p-8 text-center flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Frown className="w-12 h-12 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white italic uppercase mb-2">Transaction Failed</h2>
                    <p className="text-gray-400 text-sm break-words">{errorText || 'Please try again.'}</p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-full py-4 bg-white/10 text-white font-bold uppercase tracking-wider rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : status === 'success' ? (
              <div className="bg-[#1a1a1a] border border-[#39ff14]/30 rounded-[2rem] p-1 shadow-[0_0_50px_rgba(57,255,20,0.2)] overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                <div className="relative bg-black/50 rounded-[1.8rem] p-8 text-center flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-[#39ff14]/10 flex items-center justify-center mb-2 animate-bounce">
                    <Trophy className="w-12 h-12 text-[#39ff14]" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white italic uppercase mb-2">You Won!</h2>
                    <p className="text-gray-400 text-sm">Your dice {selectedBet} the house!</p>
                    {payoutAmountCkb !== null ? (
                      <div className="mt-2 text-xs text-gray-300">
                        Paid: <span className="font-mono">{payoutAmountCkb}</span> CKB
                      </div>
                    ) : null}
                    {payoutTxHash ? (
                      <a
                        className="mt-2 block text-xs font-mono text-purple-400 break-all"
                        href={`https://pudge.explorer.nervos.org/transaction/${payoutTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Payout tx: {payoutTxHash}
                      </a>
                    ) : errorText ? (
                      <div className="mt-2 text-xs text-red-300 break-words">{errorText}</div>
                    ) : (
                      <div className="mt-2 text-xs text-gray-500">No payout was sent for this outcome.</div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-full py-4 bg-[#39ff14] text-black font-bold uppercase tracking-wider rounded-xl hover:bg-[#32e010] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#1a1a1a] border border-red-500/30 rounded-[2rem] p-1 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                <div className="relative bg-black/50 rounded-[1.8rem] p-8 text-center flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Frown className="w-12 h-12 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white italic uppercase mb-2">You Lost</h2>
                    <p className="text-gray-400 text-sm">Better luck next time!</p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-full py-4 bg-white/10 text-white font-bold uppercase tracking-wider rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
