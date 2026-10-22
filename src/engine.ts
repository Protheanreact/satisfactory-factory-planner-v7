export type Purity = "impure" | "normal" | "pure";
export type MinerTier = 1 | 2 | 3;
export type BeltTier = 1 | 2 | 3 | 4 | 5 | 6;

export const minerBase: Record<MinerTier, number> = { 1: 60, 2: 120, 3: 240 };
export const purityFactor: Record<Purity, number> = { impure: 0.5, normal: 1, pure: 2 };
export const beltCapacity: Record<BeltTier, number> = { 1: 60, 2: 120, 3: 270, 4: 480, 5: 780, 6: 1200 };

export function nodeRate(purity: Purity, miner: MinerTier, clock: number, belt: BeltTier) {
  const minerRate = minerBase[miner] * purityFactor[purity] * clock / 100;
  const beltRate = beltCapacity[belt];
  return { minerRate, beltRate, effectiveRate: Math.min(minerRate, beltRate), bottleneck: minerRate > beltRate ? "belt" : "miner" as "belt" | "miner" };
}
