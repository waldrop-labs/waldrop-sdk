// Reads the Walrus System shared object and pulls out the fields the
// cost estimator needs:
//   - storage_price_per_unit_size  (FROST per unit per epoch)
//   - write_price_per_unit_size    (FROST per unit, one-time)
//   - epoch_duration_ms            (so callers can convert epochs → days)
//   - epoch                        (current Walrus epoch number)
//
// The Walrus System object is a thin versioned wrapper —
// `{ id, version, package_id, new_package_id }` — and the actual
// pricing/epoch state lives in a dynamic object field keyed by `u64 =
// version`. So we fetch the outer object, read its version, derive the
// dynamic-field id, and load that. Mirrors what `@mysten/walrus`'s
// `WalrusClient.systemState()` does internally, but without pulling in
// the full Walrus SDK as a dep.

import { bcs } from "@mysten/sui/bcs";
import { deriveDynamicFieldID } from "@mysten/sui/utils";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Walrus System shared object ids per network. Must match the active
 *  Walrus deployment. */
export const WALRUS_SYSTEM_OBJECTS = {
  testnet: "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af",
  mainnet: "0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2",
} as const;

export type WalrusNetwork = keyof typeof WALRUS_SYSTEM_OBJECTS;

export interface WalrusSystemSnapshot {
  /** Current Walrus epoch number. 0 if not yet read. */
  currentEpoch: number;
  /** Walrus epoch length in milliseconds. 0 if not yet read. */
  epochDurationMs: number;
  /** Walrus epoch length rounded to days (1 on testnet, 14 on mainnet). */
  epochDays: number;
  /** FROST per storage unit per epoch. 0 when unavailable. */
  storagePricePerUnitFrost: number;
  /** FROST per storage unit, one-time write fee. 0 when unavailable. */
  writePricePerUnitFrost: number;
  /** True only when both price fields are populated. */
  isAvailable: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Walks several candidate paths inside `obj` and returns the first
 *  numeric value found. The dynamic-field json wraps the inner state
 *  inside `value.fields…` on some networks and `value…` directly on
 *  others, so we try both. */
function findFirstNumber(obj: any, candidates: string[][]): number {
  for (const path of candidates) {
    let cur: any = obj;
    for (const key of path) {
      if (cur == null) break;
      cur = cur[key];
    }
    const n =
      typeof cur === "number"
        ? cur
        : typeof cur === "string" && /^[0-9]+$/.test(cur)
          ? Number(cur)
          : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

async function fetchJson(suiClient: unknown, objectId: string): Promise<any> {
  const result = await (suiClient as any).getObject({
    objectId,
    include: { json: true },
  });
  return result?.object?.json ?? null;
}

/** Reads the live Walrus System object and returns the pricing snapshot.
 *  Pass the SuiGrpcClient your `WaldropClient` was built with. */
export async function readWalrusSystem(
  suiClient: unknown,
  network: WalrusNetwork = "testnet",
): Promise<WalrusSystemSnapshot> {
  const empty: WalrusSystemSnapshot = {
    currentEpoch: 0,
    epochDurationMs: 0,
    epochDays: 0,
    storagePricePerUnitFrost: 0,
    writePricePerUnitFrost: 0,
    isAvailable: false,
  };

  const systemObjectId = WALRUS_SYSTEM_OBJECTS[network];
  const outerJson = await fetchJson(suiClient, systemObjectId);
  if (!outerJson) return empty;

  // The wrapper exposes `version` (as a string). The actual state lives
  // in a dynamic object field keyed by that version (`u64`).
  const versionRaw = outerJson.version ?? outerJson.fields?.version;
  const version =
    typeof versionRaw === "string" || typeof versionRaw === "number"
      ? BigInt(versionRaw)
      : null;
  if (version == null) return empty;

  const innerFieldId = deriveDynamicFieldID(
    systemObjectId,
    "u64",
    bcs.u64().serialize(version).toBytes(),
  );

  const innerJson = await fetchJson(suiClient, innerFieldId);
  if (!innerJson) return empty;

  // The dynamic-field wrapper is `Field<u64, SystemStateInnerVN>` —
  // value is what we want. JSON shape varies a bit across gRPC versions:
  // sometimes `value: { … }`, sometimes `value: { fields: { … } }`.
  const epochDurationMs = findFirstNumber(innerJson, [
    ["value", "epoch_duration_ms"],
    ["value", "fields", "epoch_duration_ms"],
    ["epoch_duration_ms"],
  ]);
  const currentEpoch = findFirstNumber(innerJson, [
    ["value", "committee", "epoch"],
    ["value", "committee", "fields", "epoch"],
    ["value", "epoch"],
    ["value", "fields", "epoch"],
    ["epoch"],
  ]);
  const storagePricePerUnitFrost = findFirstNumber(innerJson, [
    ["value", "storage_price_per_unit_size"],
    ["value", "fields", "storage_price_per_unit_size"],
    ["storage_price_per_unit_size"],
  ]);
  const writePricePerUnitFrost = findFirstNumber(innerJson, [
    ["value", "write_price_per_unit_size"],
    ["value", "fields", "write_price_per_unit_size"],
    ["write_price_per_unit_size"],
  ]);

  const epochDays =
    epochDurationMs > 0 ? Math.round(epochDurationMs / MS_PER_DAY) : 0;

  return {
    currentEpoch,
    epochDurationMs,
    epochDays,
    storagePricePerUnitFrost,
    writePricePerUnitFrost,
    isAvailable:
      storagePricePerUnitFrost > 0 && writePricePerUnitFrost > 0,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
