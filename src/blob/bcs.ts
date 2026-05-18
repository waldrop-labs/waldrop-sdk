// BCS schema mirroring `waldrop::storage::BlobRef`. Kept separate from
// the listing logic so it can be reused (e.g. by a future event indexer
// that wants to decode `BlobRegistered` event payloads).

import { bcs } from "@mysten/sui/bcs";

/** Move:
 *
 * ```move
 * struct BlobRef has store {
 *     blob_id: String,
 *     size_bytes: u64,
 *     stored_epoch: u64,
 *     expiry_epoch: u64,
 *     encrypted: bool,
 *     seal_policy_id: Option<address>,
 *     content_hash: vector<u8>,
 *     content_type: String,
 *     original_name: String,
 * }
 * ```
 */
export const BlobRefBcs = bcs.struct("BlobRef", {
  blob_id: bcs.string(),
  size_bytes: bcs.u64(),
  stored_epoch: bcs.u64(),
  expiry_epoch: bcs.u64(),
  encrypted: bcs.bool(),
  seal_policy_id: bcs.option(bcs.Address),
  content_hash: bcs.vector(bcs.u8()),
  content_type: bcs.string(),
  original_name: bcs.string(),
});

/** Decoded shape produced by `BlobRefBcs.parse(bytes)`. */
export interface RawBlobRef {
  blob_id: string;
  size_bytes: string | number | bigint;
  stored_epoch: string | number | bigint;
  expiry_epoch: string | number | bigint;
  encrypted: boolean;
  seal_policy_id: string | null;
  content_hash: number[];
  content_type: string;
  original_name: string;
}
