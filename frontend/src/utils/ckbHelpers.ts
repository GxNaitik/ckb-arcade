import { ccc } from '@ckb-ccc/connector-react';

/**
 * Shared CKB cell capacity calculation utilities.
 *
 * These were previously duplicated across CoinFlip, DiceRoll, NumberGuess,
 * and SpinWheel components (~16 lines × 4 = 64 lines of duplication).
 */

export function hexByteLength(hex: string): number {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Math.ceil(h.length / 2);
}

export function scriptOccupiedBytes(script: ccc.Script): number {
  return 32 + 1 + hexByteLength(script.args);
}

export function minCellCapacityCkb({ lock, type, dataHex }: { lock: ccc.Script; type?: ccc.Script; dataHex: string }): number {
  const dataBytes = hexByteLength(dataHex);
  const lockBytes = scriptOccupiedBytes(lock);
  const typeBytes = type ? scriptOccupiedBytes(type) : 0;
  const occupiedBytes = 8 + lockBytes + typeBytes + dataBytes;
  return occupiedBytes;
}
