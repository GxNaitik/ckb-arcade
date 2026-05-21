import { useState } from 'react';
import { Shield, ShieldCheck, ShieldX, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import type { FairnessProof } from '../utils/commitReveal';

interface ProvablyFairProps {
    proof: FairnessProof | null;
    className?: string;
}

export function ProvablyFairBadge({ proof, className = '' }: ProvablyFairProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    if (!proof) return null;

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch {
            // Clipboard API not available
        }
    };

    const truncateHex = (hex: string) =>
        hex.length > 16 ? `${hex.slice(0, 8)}...${hex.slice(-8)}` : hex;

    return (
        <div className={`w-full ${className}`}>
            {/* Badge Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${proof.verified
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                    }`}
            >
                <span className="flex items-center gap-2">
                    {proof.verified ? (
                        <ShieldCheck className="w-4 h-4" />
                    ) : (
                        <ShieldX className="w-4 h-4" />
                    )}
                    {proof.verified ? 'Provably Fair ✓' : 'Verification Failed'}
                </span>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
            </button>

            {/* Expanded Proof Details */}
            {isExpanded && (
                <div className="mt-2 bg-black/40 border border-white/10 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                            Fairness Proof
                        </span>
                    </div>

                    {/* Session ID */}
                    <ProofRow
                        label="Session"
                        value={proof.sessionId}
                        truncated={truncateHex(proof.sessionId)}
                        onCopy={() => copyToClipboard(proof.sessionId, 'session')}
                        isCopied={copiedField === 'session'}
                    />

                    {/* Player Secret */}
                    <ProofRow
                        label="Your Secret"
                        value={proof.playerSecret}
                        truncated={truncateHex(proof.playerSecret)}
                        onCopy={() => copyToClipboard(proof.playerSecret, 'playerSecret')}
                        isCopied={copiedField === 'playerSecret'}
                    />

                    {/* Player Hash */}
                    <ProofRow
                        label="Your Hash"
                        value={proof.playerHash}
                        truncated={truncateHex(proof.playerHash)}
                        onCopy={() => copyToClipboard(proof.playerHash, 'playerHash')}
                        isCopied={copiedField === 'playerHash'}
                    />

                    {/* House Secret */}
                    <ProofRow
                        label="House Secret"
                        value={proof.houseSecret}
                        truncated={truncateHex(proof.houseSecret)}
                        onCopy={() => copyToClipboard(proof.houseSecret, 'houseSecret')}
                        isCopied={copiedField === 'houseSecret'}
                    />

                    {/* House Hash */}
                    <ProofRow
                        label="House Hash"
                        value={proof.houseHash}
                        truncated={truncateHex(proof.houseHash)}
                        onCopy={() => copyToClipboard(proof.houseHash, 'houseHash')}
                        isCopied={copiedField === 'houseHash'}
                    />

                    {/* Combined Random */}
                    <ProofRow
                        label="Combined Random"
                        value={proof.combinedRandom}
                        truncated={truncateHex(proof.combinedRandom)}
                        onCopy={() => copyToClipboard(proof.combinedRandom, 'random')}
                        isCopied={copiedField === 'random'}
                    />

                    {/* Verification Status */}
                    <div className="pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 text-xs">
                            {proof.verified ? (
                                <>
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">
                                        Verified: hash(houseSecret) = houseHash ✓ | playerSecret ⊕
                                        houseSecret = random ✓
                                    </span>
                                </>
                            ) : (
                                <>
                                    <ShieldX className="w-3.5 h-3.5 text-red-400" />
                                    <span className="text-red-400">
                                        Verification failed — the house may have tampered with
                                        results.
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProofRow({
    label,
    value,
    truncated,
    onCopy,
    isCopied,
}: {
    label: string;
    value: string;
    truncated: string;
    onCopy: () => void;
    isCopied: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide min-w-[90px]">
                {label}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
                <code className="text-[10px] font-mono text-gray-300 truncate" title={value}>
                    {truncated}
                </code>
                <button
                    onClick={onCopy}
                    className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                    title="Copy to clipboard"
                >
                    {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                        <Copy className="w-3 h-3 text-gray-500" />
                    )}
                </button>
            </div>
        </div>
    );
}
