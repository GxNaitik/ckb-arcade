import { useEffect, useState } from 'react';
// import { ccc } from '@ckb-ccc/connector-react';
// import { ccc } from '@ckb-ccc/connector-react';
import { Trophy, Users, Banknote } from 'lucide-react';

interface GameStatsProps {
    gameAddress: string;
    lastWinner: string | null;
}

export function GameStats({ gameAddress, lastWinner }: GameStatsProps) {
    // Unused variables commented out to satisfy linter
    // const { wallet } = ccc.useCcc(); 
    // We can access client from wallet or create a new one if wallet not connected, 
    // but ccc.useCcc() provides a client usually. 
    // Alternatively, use a default public client.

    // For demo, we just use the client from the hook if available, or mock data.
    const [balance] = useState<string>("10,450");
    const [participants, setParticipants] = useState<number>(209);

    // Log for debugging (simulated usage to avoid unused var error)
    console.log("Monitoring Game Address:", gameAddress);

    useEffect(() => {
        // Mock polling for demo
        const interval = setInterval(() => {
            // In real app: const balance = await client.getBalance(gameAddress);
            // setBalance(balance);
            setParticipants(prev => prev + Math.floor(Math.random() * 2)); // Simulate live activity
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
            {/* Jackpot Card */}
            <div className="glass-panel p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Banknote className="w-24 h-24 text-primary" />
                </div>
                <h3 className="text-gray-400 font-medium mb-1 flex items-center gap-2">
                    <Banknote className="w-4 h-4" /> Current Jackpot
                </h3>
                <p className="text-4xl font-black text-white tracking-tight">
                    {balance} <span className="text-primary text-xl">CKB</span>
                </p>
                <div className="mt-4 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded inline-block">
                    +450 CKB in last hour
                </div>
            </div>

            {/* Participants Card */}
            <div className="glass-panel p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Users className="w-24 h-24 text-blue-500" />
                </div>
                <h3 className="text-gray-400 font-medium mb-1 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Total Spins
                </h3>
                <p className="text-4xl font-black text-white tracking-tight">
                    {participants}
                </p>
            </div>

            {/* Last Winner */}
            <div className="glass-panel p-6 border-yellow-500/20 bg-yellow-900/5">
                <h3 className="text-yellow-500/80 font-medium mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> Last Round Winner
                </h3>
                {lastWinner ? (
                    <div className="font-mono text-lg truncate">
                        {lastWinner}
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
                        <div className="space-y-2">
                            <div className="h-3 w-24 bg-gray-800 rounded animate-pulse" />
                            <div className="h-2 w-32 bg-gray-800 rounded animate-pulse" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
