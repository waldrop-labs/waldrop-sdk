// Walrus storage cost math. Mirrors the dapp's `lib/walrus-cost.ts`
// 1:1 — the publisher does its own authoritative calculation at PUT
// time so this is a forward-looking estimate, tightly bounded:
//
//   storage = ceil(encoded_size / unit_size) × storage_price × epochs
//   write   = ceil(encoded_size / unit_size) × write_price            (one-time)
//   total   = (storage + write) × num_blobs
//
// Walrus encodes data with ~5× redundancy (RaptorQ + erasure coding
// across shards). The exact factor depends on `n_shards`, but 5× is
// a safe upper bound for UI display.

const FROST_PER_WAL = 1_000_000_000; // 9 decimals
const STORAGE_UNIT_BYTES = 1024 * 1024; // 1 MiB
const ENCODED_REDUNDANCY = 5; // upper-bound rule of thumb

export interface CostInputs {
  /** Raw bytes per blob (single blob, or one of N in a batch). */
  bytesPerBlob: number;
  /** How many blobs will be created. */
  numBlobs: number;
  /** Walrus epochs of storage requested. */
  epochs: number;
  /** From Walrus System: FROST per storage unit per epoch. */
  storagePricePerUnitFrost: number;
  /** From Walrus System: FROST per storage unit, one-time. */
  writePricePerUnitFrost: number;
}

export interface CostBreakdown {
  /** Total cost in FROST. */
  totalFrost: number;
  /** Storage portion (price × epochs × units). */
  storageFrost: number;
  /** Write portion (one-time × units). */
  writeFrost: number;
  /** Encoded storage units consumed across all blobs. */
  totalUnits: number;
  /** Total in WAL (1 WAL = 1e9 FROST). Convenience for display. */
  totalWal: number;
  /** Whether we have valid pricing inputs from the System object. */
  isAvailable: boolean;
}

/** Pure cost math — no network calls. Given pricing + input dims,
 *  computes the breakdown. Use `CostApi.estimate` if you want it to
 *  fetch the live Walrus System pricing for you. */
export function calculateCost(input: CostInputs): CostBreakdown {
  const {
    bytesPerBlob,
    numBlobs,
    epochs,
    storagePricePerUnitFrost,
    writePricePerUnitFrost,
  } = input;

  const isAvailable =
    storagePricePerUnitFrost > 0 &&
    writePricePerUnitFrost > 0 &&
    epochs > 0 &&
    numBlobs > 0 &&
    bytesPerBlob > 0;

  if (!isAvailable) {
    return {
      totalFrost: 0,
      storageFrost: 0,
      writeFrost: 0,
      totalUnits: 0,
      totalWal: 0,
      isAvailable: false,
    };
  }

  const encodedBytes = bytesPerBlob * ENCODED_REDUNDANCY;
  const unitsPerBlob = Math.max(1, Math.ceil(encodedBytes / STORAGE_UNIT_BYTES));
  const totalUnits = unitsPerBlob * numBlobs;

  const storageFrost = totalUnits * storagePricePerUnitFrost * epochs;
  const writeFrost = totalUnits * writePricePerUnitFrost;
  const totalFrost = storageFrost + writeFrost;

  return {
    totalFrost,
    storageFrost,
    writeFrost,
    totalUnits,
    totalWal: totalFrost / FROST_PER_WAL,
    isAvailable: true,
  };
}
