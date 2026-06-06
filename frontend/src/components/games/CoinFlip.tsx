import { useState, useEffect } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { Loader2, Zap, Trophy, Frown } from 'lucide-react';
import { getAudioContext } from '../../utils/audio';
import { playCommitReveal, type FairnessProof } from '../../utils/commitReveal';
import { sendWithRetry } from '../../utils/sendWithRetry';
import { minCellCapacityCkb } from '../../utils/ckbHelpers';
import { ProvablyFairBadge } from '../ProvablyFairBadge';

// Coin flip sound effect
const playCoinFlipSound = () => {
  try {
    const audioContext = getAudioContext();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Create a coin flip ringing sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.15);
    oscillator.frequency.exponentialRampToValueAtTime(450, audioContext.currentTime + 0.25);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (_e) {
    console.log('Audio not supported');
  }
};

// Win sound effect
const playWinSound = () => {
  try {
    const audioContext = getAudioContext();
    if (!audioContext) return;
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
  } catch (_e) {
    console.log('Audio not supported');
  }
};

interface CoinFlipProps {
  gameAddress: string;
  walletAddress?: string;
  onConnect?: () => void;
  signer?: ReturnType<typeof ccc.useSigner> | null;
  onTx?: (txHash: string) => void;
  onWin: (winner: string) => void;
}



export function CoinFlip({
  gameAddress,
  walletAddress,
  onConnect,
  signer,
  onTx,
  onWin,
}: CoinFlipProps) {
  const isConnected = Boolean(walletAddress);
  const [errorText, setErrorText] = useState<string>('');
  const [payoutTxHash, setPayoutTxHash] = useState<string>('');
  const [payoutAmountCkb, setPayoutAmountCkb] = useState<number | null>(null);
  const [fairnessProof, setFairnessProof] = useState<FairnessProof | null>(null);

  const [isFlipping, setIsFlipping] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'heads' | 'tails'>('heads');
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [status, setStatus] = useState<'idle' | 'flipping' | 'success' | 'lost' | 'error'>('idle');
  const [showModal, setShowModal] = useState(false);
  const [coinRotation, setCoinRotation] = useState(0);

  useEffect(() => {
    console.log("Coin Flip game initialized at:", gameAddress);
  }, [gameAddress]);

  const handleFlip = async () => {
    if (isFlipping) return;
    if (!isConnected) {
      onConnect?.();
      return;
    }
    if (!signer) {
      onConnect?.();
      return;
    }

    try {
      setIsFlipping(true);
      setStatus('flipping');
      setShowModal(false);
      setErrorText('');
      setPayoutTxHash('');
      setPayoutAmountCkb(null);
      setFairnessProof(null);
      setResult(null);
      // Reset rotation to 0 so each flip starts fresh (prevents parity drift)
      setCoinRotation(0);

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

      const minBetCkb = minCellCapacityCkb({ lock: toLock, dataHex: '0x' });
      const finalBetAmount = Math.max(betAmount, minBetCkb);
      const txHash = await sendWithRetry({ signer, toLock, amountCkb: finalBetAmount });
      onTx?.(txHash);

      // Start coin flip animation
      playCoinFlipSound();

      // Run commit-reveal to get provably fair outcome
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      let finalResult: 'heads' | 'tails';
      let won: boolean;
      let winAmount = 0;
      let returnedPayoutTxHash: string | undefined;
      let returnedPayoutAmountCkb: number | undefined;

      if (API_BASE) {
        // Provably fair mode — use commit-reveal
        const crResult = await playCommitReveal({
          gameType: 'coin-flip',
          betAmount,
          betTxHash: txHash,
          playerChoice: selectedSide,
          playerAddress: walletAddress ?? '',
        });

        finalResult = crResult.outcome.details.coinResult as 'heads' | 'tails';
        won = crResult.outcome.won;
        winAmount = crResult.outcome.winAmount;
        returnedPayoutTxHash = crResult.payoutTxHash;
        returnedPayoutAmountCkb = crResult.payoutAmountCkb;
        setFairnessProof(crResult.proof);
      } else {
        // Demo mode — fallback to Math.random
        finalResult = Math.random() < 0.5 ? 'heads' : 'tails';
        won = selectedSide === finalResult;
        winAmount = won ? betAmount * 2 : 0;
        returnedPayoutTxHash = 'demo-mode';
        returnedPayoutAmountCkb = winAmount;
      }

      // Animate the coin to match the result
      const fullSpins = 10 + Math.floor(Math.random() * 5);
      const baseRotation = fullSpins * 360;
      const totalRotation = baseRotation + (finalResult === 'tails' ? 180 : 0);

      // Small delay so the browser registers the reset to 0 before animating
      await new Promise(r => setTimeout(r, 50));
      setCoinRotation(totalRotation);

      // Wait for animation to finish
      await new Promise(r => setTimeout(r, 2200));

      setResult(finalResult);

      if (won) {
        setStatus('success');
        onWin(walletAddress ?? '');
        playWinSound();

        if (returnedPayoutTxHash) setPayoutTxHash(returnedPayoutTxHash);
        if (returnedPayoutAmountCkb !== undefined) setPayoutAmountCkb(returnedPayoutAmountCkb);
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
      setIsFlipping(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 relative z-10 w-full py-4">
      <div className="text-center space-y-2">
        <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tight drop-shadow-2xl pr-2">CKB <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400">COIN FLIP</span></h2>
        <p className="text-gray-400">Classic 50/50 coin flip! Double your CKB on correct guess!</p>
      </div>

      {/* Coin Display */}
      <div className="relative w-48 h-48" style={{ perspective: '1000px' }}>
        <div
          className="w-full h-full relative transition-transform ease-[cubic-bezier(0.2,0,0,1)] duration-[2000ms]"
          style={{ transform: `rotateY(${coinRotation}deg)`, transformStyle: 'preserve-3d' }}
        >
          {/* Heads Side */}
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-yellow-300"
            style={{ backfaceVisibility: 'hidden' }}>
            <div className="text-center">
              <div className="text-6xl mb-2">👑</div>
              <div className="text-black font-bold text-xl">HEADS</div>
            </div>
          </div>

          {/* Tails Side */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-gray-300"
            style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}>
            <div className="text-center">
              <div className="text-6xl mb-2">🦅</div>
              <div className="text-white font-bold text-xl">TAILS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Result Display */}
      {result && !isFlipping && (
        <div className="text-center space-y-2">
          <div className="text-2xl font-bold text-white">
            Result: <span className={result === 'heads' ? 'text-yellow-400' : 'text-gray-400'}>
              {result.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Betting Controls */}
      <div className="w-full max-w-md space-y-4">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Choose Your Side</label>
          <div className="grid grid-cols-2 gap-2">
            {(['heads', 'tails'] as const).map((side) => (
              <button
                key={side}
                onClick={() => setSelectedSide(side)}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${selectedSide === side
                  ? side === 'heads'
                    ? 'bg-yellow-500 text-black'
                    : 'bg-gray-500 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
              >
                <div className="text-2xl mb-1">{side === 'heads' ? '👑' : '🦅'}</div>
                {side.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (CKB)</label>
          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 500, 1000].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${betAmount === amount
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Flip Button */}
      <button
        onClick={handleFlip}
        disabled={isFlipping}
        className={`
          relative group overflow-hidden rounded-xl px-12 py-4 font-black text-2xl uppercase tracking-widest transition-all
          ${!isConnected
            ? 'bg-primary text-black hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(57,255,20,0.4)] border border-green-400'
            : isFlipping
              ? 'bg-gray-900 text-yellow-500 cursor-wait border border-yellow-900'
              : 'bg-purple-500 text-white hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(168,85,247,0.4)] border border-purple-400'
          }
        `}
      >
        {isFlipping ? (
          <Loader2 className="animate-spin w-8 h-8" />
        ) : (
          <span className="relative z-10 flex items-center gap-2">
            {isConnected ? (
              <span className="flex flex-col items-center leading-none">
                <span className="flex items-center gap-2">
                  FLIP <Zap className="w-5 h-5 fill-current" />
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

        {!isFlipping && isConnected && (
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
                    <p className="text-gray-400 text-sm">The coin landed on {result}!</p>
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
                  <ProvablyFairBadge proof={fairnessProof} />
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
                    <p className="text-gray-400 text-sm">The coin landed on {result}!</p>
                  </div>
                  <ProvablyFairBadge proof={fairnessProof} />
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
