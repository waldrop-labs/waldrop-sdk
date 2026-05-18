// PTB builders for blob registration. Mirrors the dapp's
// `lib/transactions.ts` — same Move calls, same argument shapes, same
// atomic-PTB structure. Anything that diverges is a bug.
//
// Two top-level builders:
//   - buildRegisterBlobTx: BlobStore already exists
//   - buildCreateAndRegisterBlobTx: first upload, create + register
//     + share-object in one PTB
//
// Both bundle `add_blob_share` calls when `initialShareViewers` is
// passed and the blob is SEAL-encrypted (per-blob ACL keyed by marker).

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export interface BlobMetaParams {
  /** Walrus blob_id returned by the publisher. */
  blobId: string;
  /** Size in bytes of the original (pre-encryption) data. */
  sizeBytes: number;
  /** Sui epoch the blob was registered in. */
  storedEpoch: number;
  /** Sui epoch the storage reservation expires (storedEpoch + epochs). */
  expiryEpoch: number;
  /** True if the blob is SEAL-encrypted. */
  encrypted: boolean;
  /** SHA-256 of the original (pre-encryption) bytes. */
  contentHash: Uint8Array;
  /** MIME type recorded on-chain. */
  contentType: string;
  /** Filename recorded on-chain. */
  originalName: string;
  /** Sui address signing the transaction. */
  senderAddress: string;
  /** 16-byte SEAL marker — required to register an encrypted blob,
   *  ignored for plaintext. */
  sealMarker?: Uint8Array;
  /** Addresses to grant per-blob decrypt access in the same PTB. */
  initialShareViewers?: string[];
}

export interface RegisterBlobParams extends BlobMetaParams {
  /** Existing BlobStore object id. */
  blobStoreId: string;
  /** User's Subscription object id (`register_blob` gates on plan). */
  subscriptionId: string;
}

export interface CreateAndRegisterBlobParams extends BlobMetaParams {
  /** User's Subscription object id (`register_blob` gates on plan). */
  subscriptionId: string;
}

/** Append `add_blob_share` Move calls to grant per-blob decrypt access
 *  in the same PTB as registration. Skipped when no viewers, no marker,
 *  or only the sender is listed. Filters out self and dedupes. */
function appendInitialShareCalls(
  tx: Transaction,
  storeArg:
    | ReturnType<Transaction["object"]>
    | ReturnType<Transaction["moveCall"]>,
  p: BlobMetaParams,
) {
  if (!p.initialShareViewers || p.initialShareViewers.length === 0) return;
  if (!p.sealMarker) return;
  const senderLower = p.senderAddress.toLowerCase();
  const seen = new Set<string>();
  for (const raw of p.initialShareViewers) {
    const addr = raw.trim();
    if (!addr) continue;
    if (addr.toLowerCase() === senderLower) continue; // contract aborts on self
    if (seen.has(addr.toLowerCase())) continue;
    seen.add(addr.toLowerCase());
    tx.moveCall({
      target: `${PACKAGE_ID}::storage::add_blob_share`,
      arguments: [
        storeArg,
        tx.object(SHARED_OBJECTS.globalConfig),
        tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(p.sealMarker!))),
        tx.pure.address(addr),
      ],
    });
  }
}

/** Build a `new_blob_ref` Move call returning a BlobRef value usable
 *  as the last argument to `register_blob`. */
function newBlobRefMoveCall(tx: Transaction, p: BlobMetaParams) {
  const sealMarkerArg =
    p.sealMarker !== undefined
      ? tx.pure(
          bcs
            .option(bcs.vector(bcs.u8()))
            .serialize(Array.from(p.sealMarker)),
        )
      : tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null));

  return tx.moveCall({
    target: `${PACKAGE_ID}::storage::new_blob_ref`,
    arguments: [
      tx.pure.string(p.blobId),
      tx.pure.u64(p.sizeBytes),
      tx.pure.u64(p.storedEpoch),
      tx.pure.u64(p.expiryEpoch),
      tx.pure.bool(p.encrypted),
      tx.pure(bcs.option(bcs.Address).serialize(null)), // no SEAL policy id
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(p.contentHash))),
      tx.pure.string(p.contentType),
      tx.pure.string(p.originalName),
      tx.pure(bcs.option(bcs.string()).serialize(null)), // quilt_blob_id — standalone
      sealMarkerArg,
    ],
  });
}

/** Register a blob into an existing BlobStore. The blob must already be
 *  uploaded to Walrus and the publisher must have returned `blobId`. */
export function buildRegisterBlobTx(p: RegisterBlobParams): Transaction {
  const tx = new Transaction();
  tx.setSender(p.senderAddress);

  const blobRef = newBlobRefMoveCall(tx, p);

  tx.moveCall({
    target: `${PACKAGE_ID}::storage::register_blob`,
    arguments: [
      tx.object(p.blobStoreId),
      tx.object(SHARED_OBJECTS.globalConfig),
      tx.object(SHARED_OBJECTS.planRegistry),
      tx.object(p.subscriptionId),
      blobRef,
    ],
  });

  appendInitialShareCalls(tx, tx.object(p.blobStoreId), p);

  return tx;
}

/** Create a new shared BlobStore and register a first blob into it in
 *  one PTB. Used on first upload when the user has no BlobStore yet. */
export function buildCreateAndRegisterBlobTx(
  p: CreateAndRegisterBlobParams,
): Transaction {
  const tx = new Transaction();
  tx.setSender(p.senderAddress);

  // 1. Create store by-value (legacy variant — composable in PTB).
  const store = tx.moveCall({
    target: `${PACKAGE_ID}::storage::create_blob_store`,
  });

  const blobRef = newBlobRefMoveCall(tx, p);

  // 2. Register first blob.
  tx.moveCall({
    target: `${PACKAGE_ID}::storage::register_blob`,
    arguments: [
      store,
      tx.object(SHARED_OBJECTS.globalConfig),
      tx.object(SHARED_OBJECTS.planRegistry),
      tx.object(p.subscriptionId),
      blobRef,
    ],
  });

  // 3. Per-blob shares BEFORE share_object — once the store is shared
  //    we can't borrow `&mut` anymore in this PTB.
  appendInitialShareCalls(tx, store, p);

  // 4. Share the BlobStore so future viewer-ACL dry-runs (seal_approve)
  //    can reference it.
  tx.moveCall({
    target: `0x2::transfer::public_share_object`,
    typeArguments: [`${PACKAGE_ID}::storage::BlobStore`],
    arguments: [store],
  });

  return tx;
}
