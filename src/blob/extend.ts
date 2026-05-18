// Blob extension — atomically extends both Walrus storage AND Waldrop's
// on-chain `BlobRef.expiry_epoch` in a single PTB. The two must stay in
// sync: extending only Walrus leaves the Waldrop UI showing a stale
// expiry; extending only Waldrop's metadata doesn't actually keep the
// data on Walrus (the bytes will get garbage-collected).
//
// `@mysten/walrus` is loaded lazily so the SDK doesn't pull the WASM
// runtime for callers that never extend.

import { Transaction } from "@mysten/sui/transactions";
import { SHARED_OBJECTS } from "../constants";
import { WaldropError } from "../errors";
import type { ExtendBlobArgs, ExtendBlobResult, TransactionSigner } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

let _walrusExtension: any | undefined | null = undefined;

/** Lazy-load `@mysten/walrus`. Cached after first call. Returns `null`
 *  if the package isn't installed (it's an optional dep — callers that
 *  never extend / delete blobs don't need it). */
async function loadWalrusExtension(): Promise<any | null> {
  if (_walrusExtension !== undefined) return _walrusExtension;
  try {
    const mod = await import("@mysten/walrus");
    _walrusExtension = (mod as any).walrus;
  } catch {
    _walrusExtension = null;
  }
  return _walrusExtension;
}

/** Walrus-extended SuiGrpcClient. We don't keep a long-lived instance —
 *  callers pass in their own `suiClient`, we extend it for the duration
 *  of one call. */
async function getWalrusExtendedClient(suiClient: unknown): Promise<any> {
  const walrusFn = await loadWalrusExtension();
  if (!walrusFn) {
    throw new WaldropError(
      "@mysten/walrus is not installed. Add it: `bun add @mysten/walrus` (or npm/yarn equivalent).",
    );
  }
  if (!(suiClient as any)?.$extend) {
    throw new WaldropError(
      "Provided suiClient does not support $extend. Pass a SuiGrpcClient from @mysten/sui/grpc.",
    );
  }
  return (suiClient as any).$extend(walrusFn());
}

export interface ExtendBlobContext {
  readonly suiClient: unknown;
  readonly packageId: string;
}

/** Build a PTB that:
 *    1. Calls Walrus's `extend_blob` (pays WAL for additional storage epochs).
 *    2. Calls Waldrop's `storage::extend_blob` (syncs the `BlobRef.expiry_epoch`
 *       and enforces plan-tier `max_walrus_epochs`).
 *
 *  Both calls land in one tx — either both succeed (Walrus storage
 *  extended AND Waldrop metadata synced) or both abort (no drift).
 *
 *  Returns the built `Transaction` so callers can inspect/sign it
 *  themselves. Use `extendBlob` (below) for the higher-level
 *  build-sign-execute one-shot.
 */
export async function buildExtendBlobTx(
  ctx: ExtendBlobContext,
  args: ExtendBlobArgs,
): Promise<Transaction> {
  const walrusClient = await getWalrusExtendedClient(ctx.suiClient);

  const tx = new Transaction();
  tx.setSender(args.senderAddress);

  // 1. Walrus side — appends the Walrus Move call. The SDK builder
  //    returns a function that takes the tx and mutates it in place.
  await walrusClient.walrus.extendBlob({
    blobObjectId: args.walrusBlobObjectId,
    epochs: args.additionalEpochs,
  })(tx);

  // 2. Waldrop side — sync BlobRef.expiry_epoch + enforce plan cap.
  tx.moveCall({
    target: `${ctx.packageId}::storage::extend_blob`,
    arguments: [
      tx.object(args.blobStoreId),
      tx.object(SHARED_OBJECTS.globalConfig),
      tx.object(SHARED_OBJECTS.planRegistry),
      tx.object(args.subscriptionId),
      tx.pure.string(args.blobId),
      tx.pure.u64(args.additionalEpochs),
    ],
  });

  return tx;
}

/** Atomically extend a blob's storage on Walrus AND update Waldrop's
 *  on-chain metadata. Single signature, single gas charge, atomic
 *  semantics — either both succeed or both abort.
 *
 *  ```ts
 *  await client.blob.extend({
 *    blobId,
 *    walrusBlobObjectId,
 *    additionalEpochs: 30,
 *    blobStoreId,
 *    subscriptionId,
 *    senderAddress,
 *    signer: dAppKit,
 *  });
 *  ```
 *
 *  Requires `@mysten/walrus` to be installed (optional peer dep). The
 *  SDK lazy-imports it so callers that never extend pay no bundle cost.
 */
export async function extendBlob(
  ctx: ExtendBlobContext,
  args: ExtendBlobArgs,
  signer: TransactionSigner,
): Promise<ExtendBlobResult> {
  const tx = await buildExtendBlobTx(ctx, args);
  const result = await signer.signAndExecuteTransaction({ transaction: tx });
  const digest =
    (result as any)?.digest ?? (result as any)?.Transaction?.digest ?? "";
  return { transactionDigest: String(digest) };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
