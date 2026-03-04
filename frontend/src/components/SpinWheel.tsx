import { useState, useEffect } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { Loader2, Zap, PartyPopper, Frown, Trophy } from 'lucide-react';

interface SpinWheelProps {
    gameAddress: string;
    walletAddress?: string;
    onConnect?: () => void;
    signer?: ReturnType<typeof ccc.useSigner> | null;
    onTx?: (txHash: string) => void;
    onOutcome?: (outcome: { label: string; value: number; txHash: string }) => void;
    onWin: (winner: string) => void;
}

// Wheel Configuration
const SEGMENTS = [
    { label: '100 CKB', value: 100, color: '#facc15', textColor: '#000', probability: 0.25 },
    { label: 'EMPTY', value: 0, color: '#ef4444', textColor: '#fff', probability: 0.299 },
    { label: '200 CKB', value: 200, color: '#3b82f6', textColor: '#fff', probability: 0.12 },
    { label: 'EMPTY', value: 0, color: '#22c55e', textColor: '#000', probability: 0.299 },
    { label: 'JACKPOT', value: 10000, color: '#a855f7', textColor: '#fff', probability: 0.002 },
    { label: '500 CKB', value: 500, color: '#f97316', textColor: '#fff', probability: 0.03 },
];

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

export function SpinWheel({
    gameAddress,
    walletAddress,
    onConnect,
    signer,
    onTx,
    onOutcome,
    onWin,
}: SpinWheelProps) {
    const isConnected = Boolean(walletAddress);
    const [errorText, setErrorText] = useState<string>('');
    const [payoutTxHash, setPayoutTxHash] = useState<string>('');
    const [payoutAmountCkb, setPayoutAmountCkb] = useState<number | null>(null);

    const [isSpinning, setIsSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [status, setStatus] = useState<'idle' | 'spinning' | 'success' | 'lost' | 'error'>('idle');
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        console.log("Game initialized at:", gameAddress);
    }, [gameAddress]);

    const handleSpin = async () => {
        if (isSpinning) return;
        if (!isConnected) {
            onConnect?.();
            return;
        }
        if (!signer) {
            onConnect?.();
            return;
        }

        try {
            setIsSpinning(true);
            setStatus('spinning');
            setShowModal(false);
            setErrorText('');
            setPayoutTxHash('');
            setPayoutAmountCkb(null);

            const requestedBetCkb = 100;
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
            const betAmountCkb = Math.max(requestedBetCkb, minBetCkb).toString();
            const tx = ccc.Transaction.from({
                outputs: [{ lock: toLock }],
                outputsData: [outputDataHex],
            });
            tx.outputs.forEach((output) => {
                output.capacity = ccc.fixedPointFrom(betAmountCkb);
            });
            await tx.completeInputsByCapacity(signer);
            await tx.completeFeeBy(signer, 1000);
            const txHash = await signer.sendTransaction(tx);
            onTx?.(txHash);

            // Determine result based on probabilities (Simulation)
            const random = Math.random();
            let accumulatedProbability = 0;
            let selectedSegmentIndex = 0;

            for (let i = 0; i < SEGMENTS.length; i++) {
                accumulatedProbability += SEGMENTS[i].probability;
                if (random <= accumulatedProbability) {
                    selectedSegmentIndex = i;
                    break;
                }
            }

            // Calculate Rotation
            // We want to land on the MIDDLE of the segment.
            // Segment Size = 360 / SEGMENTS.length
            const segmentAngle = 360 / SEGMENTS.length;

            // Current Rotation mod 360 gives us the current "position" relative to 0.
            // We want to add enough rotations to spin for a few seconds.
            const spins = 5; // Minimum full spins
            const baseRotation = 360 * spins;

            // The wheel rotates CLOCKWISE. The ticker is at the TOP (0 degrees).
            // To land on Index i, we need the wheel to rotate such that Segment i is at the top.
            // If Segment 0 is at 0-60 deg, Segment 1 is at 60-120...
            // To get Segment i to the top, we need to rotate NEGATIVE (counter-clockwise) to bring it there?
            // Actually, we are just adding rotation.
            // Target Rotation = Current + Base + Offset
            // Offset logic:
            // 0 deg = border between last and first.
            // Center of Segment 0 is at segmentAngle/2.
            // Center of Segment i is at (i * segmentAngle) + segmentAngle/2.
            // BUT, if we rotate forward 30 degrees, the segment at 330 moves to 0.
            // So to get Segment i (at Angle A) to 0, we need to rotate 360 - A.

            const targetSegmentAngle = (selectedSegmentIndex * segmentAngle) + (segmentAngle / 2);
            // Add a little randomness within the segment (+/- 40% of segment width)
            const randomOffset = (Math.random() - 0.5) * (segmentAngle * 0.8);

            // The angle we want the wheel to STOP at (relative to the pointer at 0)
            const stopAngle = 360 - targetSegmentAngle + randomOffset;

            // New total rotation
            // We need to ensure we always spin forward.
            const currentTotal = rotation;
            const currentMod = currentTotal % 360;
            const distanceToStop = (stopAngle - currentMod + 360) % 360; // Distance to rotate to get to stopAngle

            const finalRotation = currentTotal + baseRotation + distanceToStop;

            setRotation(finalRotation);

            // Wait for animation
            await new Promise(r => setTimeout(r, 4500)); // slightly longer than CSS transition

            const result = SEGMENTS[selectedSegmentIndex];

            onOutcome?.({ label: result.label, value: result.value, txHash });

            if (result.value > 0) {
                setStatus('success');
                onWin(walletAddress ?? '');

                try {
                    const API_BASE = import.meta.env.VITE_API_BASE || '';
                    const payoutApiKey = import.meta.env.VITE_PAYOUT_API_KEY;
                    
                    // Skip payout if no API base URL is set
                    if (!API_BASE) {
                        console.log('No API base URL set, skipping payout');
                        setPayoutAmountCkb(result.value);
                        setPayoutTxHash('demo-mode');
                        return;
                    }

                    const resp = await fetch(`${API_BASE}/api/payout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(payoutApiKey ? { 'x-api-key': payoutApiKey } : {}),
                        },
                        body: JSON.stringify({
                            toAddress: walletAddress,
                            amountCkb: result.value,
                            betTxHash: txHash,
                        }),
                    });

                    if (!resp.ok) {
                        // Try to parse error response as JSON
                        let errorData;
                        try {
                            errorData = await resp.json();
                        } catch (e) {
                            // If we can't parse as JSON, just use the status text
                            throw new Error(`Payout failed with status ${resp.status}: ${resp.statusText}`);
                        }

                        // Handle underfunded wallet case
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
                        
                        // Handle other error cases
                        throw new Error(errorData.message || errorData.error || `Payout failed with status ${resp.status}`);
                    }

                    // Handle successful response
                    const json = await resp.json();
                    // Handle successful payout
                    if (json.payoutTxHash) {
                        setPayoutTxHash(json.payoutTxHash);
                    }
                    if (typeof json.amountCkb === 'number') {
                        setPayoutAmountCkb(json.amountCkb);
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
            setIsSpinning(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-10 relative z-10 w-full py-4">

            {/* Main Wheel Container */}
            <div className="relative wheel-container scale-90 md:scale-100">

                {/* Outer Glow/Decor */}
                <div className="absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse" />

                {/* The Wheel Board */}
                <div className="relative w-[340px] h-[340px] md:w-[450px] md:h-[450px] bg-[#1a1a1a] rounded-full border-8 border-[#2a2a2a] shadow-2xl flex items-center justify-center p-2">

                    {/* Lights Ring */}
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-white/10 animate-[spin-slow_20s_linear_infinite]" />

                    {/* Dynamic Wheel */}
                    <div
                        className="w-full h-full rounded-full overflow-hidden relative shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] transition-transform ease-[cubic-bezier(0.2,0,0,1)] duration-[4000ms]"
                        style={{ transform: `rotate(${rotation}deg)` }}
                    >

                        {/* 
                           Better Segment Rendering:
                           We use a Conic Gradient for the background to ensure no gaps, 
                           and then absolute position the Text labels.
                        */}
                        <div className="absolute inset-0 rounded-full"
                            style={{
                                background: `conic-gradient(
                                     ${SEGMENTS.map((s, i) => {
                                    const start = i * (100 / SEGMENTS.length);
                                    const end = (i + 1) * (100 / SEGMENTS.length);
                                    return `${s.color} ${start}% ${end}%`;
                                }).join(', ')}
                                 )`
                            }}
                        />

                        {/* Segment Content (Labels) */}
                        {SEGMENTS.map((segment, index) => {
                            const angle = (index * 360 / SEGMENTS.length) + (360 / SEGMENTS.length / 2); // Center of segment
                            return (
                                <div
                                    key={index}
                                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                    style={{ transform: `rotate(${angle}deg)` }}
                                >
                                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center" style={{ paddingTop: '20px' }}>
                                        <span
                                            className="block font-black uppercase tracking-wider text-sm md:text-base drop-shadow-md"
                                            style={{
                                                color: segment.textColor,
                                                transform: 'rotate(-90deg)', // Orient text outwards? Or Keep vertical?
                                                // Actually, typically text runs ALONG the radius.
                                                writingMode: 'vertical-rl',
                                                textOrientation: 'mixed'
                                            }}
                                        >
                                            {segment.label}
                                        </span>
                                        {segment.value > 0 && (
                                            <Trophy className="w-4 h-4 mx-auto mt-2 opacity-80" style={{ color: segment.textColor }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Inner Hub */}
                    <div className="absolute w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-300 rounded-full shadow-xl flex items-center justify-center z-10 border-4 border-gray-200">
                        <div className="w-16 h-16 rounded-full bg-white border-4 border-gray-100 flex items-center justify-center">
                            <span className="font-black text-xs text-black italic">WIN</span>
                        </div>
                    </div>

                </div>

                {/* The Pointer / Ticker */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20">
                    <div className="relative">
                        {/* Ticker Body */}
                        <div
                            className="w-12 h-14 bg-gradient-to-b from-red-500 to-red-700 rounded-b-lg border-2 border-white shadow-lg flex justify-center"
                            style={{
                                clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
                                transformOrigin: 'top center',
                                transform: `rotate(${isSpinning ? Math.sin(Date.now() / 50) * 10 : 0}deg)` // Simple wobble effect
                            }}
                        >
                            <div className="w-2 h-2 bg-white/50 rounded-full mt-1" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full flex justify-center mt-10">
                <button
                    onClick={handleSpin}
                    disabled={isSpinning}
                    className={`
                        relative group overflow-hidden rounded-2xl px-12 py-4 font-black text-2xl uppercase tracking-widest transition-all
                        ${!isConnected
                            ? 'bg-gray-800 text-gray-300 cursor-pointer border border-gray-700'
                            : isSpinning
                                ? 'bg-gray-900 text-yellow-500 cursor-wait border border-yellow-900'
                                : 'bg-primary text-black hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(57,255,20,0.4)] border border-green-400'
                        }
                    `}
                >
                    {isSpinning ? (
                        <Loader2 className="animate-spin w-8 h-8" />
                    ) : (
                        <span className="relative z-10 flex items-center gap-2">
                            {isConnected ? (
                                <span className="flex flex-col items-center leading-none">
                                    <span className="flex items-center gap-2">
                                        SPIN <Zap className="w-5 h-5 fill-current" />
                                    </span>
                                    <span className="mt-1 text-[11px] font-mono font-bold text-black/70">(100 CKB)</span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    CONNECT <Zap className="w-5 h-5 fill-current" />
                                </span>
                            )}
                        </span>
                    )}

                    {!isSpinning && isConnected && (
                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12" />
                    )}
                </button>
            </div>


            {/* RESULT MODAL */}
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
                                        <PartyPopper className="w-12 h-12 text-[#39ff14]" />
                                    </div>

                                    <div>
                                        <h2 className="text-3xl font-black text-white italic uppercase mb-2">You Won!</h2>
                                        <p className="text-gray-400 text-sm">Your payout has been sent.</p>
                                        {payoutAmountCkb !== null ? (
                                            <div className="mt-2 text-xs text-gray-300">
                                                Paid: <span className="font-mono">{payoutAmountCkb}</span> CKB
                                            </div>
                                        ) : null}
                                        {payoutTxHash ? (
                                            <a
                                                className="mt-2 block text-xs font-mono text-primary break-all"
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
                                        <h2 className="text-3xl font-black text-white italic uppercase mb-2">No Luck</h2>
                                        <p className="text-gray-400 text-sm">Better luck next time.</p>
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
