// Single-blob upload orchestration. Composes the existing crypto
// (SEAL encrypt), the publisher PUT, and the on-chain registration PTB
// into one `client.blob.upload(args)` call. Mirrors the dapp's
// `useUpload.storeToWalrus` exactly — same hash, same publisher
// query params, same PTB construction — minus the transform-engine
// and remote-source paths (web2-specific, out of SDK scope).

import {
  InsufficientGasError,
  RegistrationError,
  WaldropError,
  type UploadCheckpoint,
} from "../errors";
import { sealEncrypt } from "../decrypt/encrypt";
import { sha256 } from "./hash";
import { uploadToWalrusPublisher } from "./walrus";
import { packFilesAsTar } from "./tar";
import {
  buildCreateAndRegisterBlobTx,
  buildRegisterBlobTx,
} from "./transactions";
import type { WaldropNetwork } from "../constants";
import { TYPES } from "../constants";
import type {
  RegisterBlobArgs,
  UploadBlobArgs,
  UploadBlobResult,
  UploadBundleArgs,
  UploadProgressEvent,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function emit(
  cb: ((e: UploadProgressEvent) => void) | undefined,
  stage: UploadProgressEvent["stage"],
  percent: number,
) {
  try {
    cb?.({ stage, percent });
  } catch {
    // Don't let a buggy user callback abort the upload.
  }
}

/** Read the current Sui epoch from the active SuiClient. Used to stamp
 *  `stored_epoch` and compute `expiry_epoch` on the BlobRef.
 *
 *  Tries the gRPC client's `core.getCurrentSystemState` first (where
 *  `SuiGrpcClient` actually exposes it), then falls back to a method
 *  on the client root (dapp-kit's `useCurrentClient` shape). */
async function getCurrentSuiEpoch(suiClient: unknown): Promise<number> {
  const client = suiClient as any;
  const tryFns = [
    () => client.core?.getCurrentSystemState?.(),
    () => client.getCurrentSystemState?.(),
  ];
  for (const fn of tryFns) {
    try {
      const state = await fn();
      const epoch = state?.systemState?.epoch ?? state?.epoch;
      if (epoch != null) return Number(epoch);
    } catch {
      // try next path
    }
  }
  return 0;
}

/** Recognise the Sui "insufficient gas" error shape so callers can
 *  branch on `InsufficientGasError` and show a "top up your wallet"
 *  prompt instead of a generic registration-failed message. Falls
 *  back to plain `RegistrationError` when the pattern doesn't match. */
function classifyRegisterError(
  err: unknown,
  checkpoint: UploadCheckpoint,
): RegistrationError {
  const raw = err instanceof Error ? err.message : String(err);
  // Sui's RPC message URL-encodes the human text on some transports;
  // decode opportunistically so the regex below sees the readable form.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // not encoded — fine
  }

  const isGasError =
    /insufficient.*SUI balance/i.test(decoded) ||
    /Unable to perform gas selection/i.test(decoded);
  if (!isGasError) {
    return new RegistrationError(raw, checkpoint, { cause: err });
  }

  const budgetMatch = /required budget (\d+)/i.exec(decoded);
  const addrMatch = /account (0x[0-9a-fA-F]{1,64})/.exec(decoded);
  const requiredMist = budgetMatch?.[1] ? Number(budgetMatch[1]) : null;
  const address = addrMatch?.[1] ?? null;

  const friendly =
    requiredMist != null && address
      ? `Wallet ${address} needs ~${(requiredMist / 1e9).toFixed(6)} SUI for ` +
        `gas (${requiredMist} MIST). Top up via the testnet faucet and retry ` +
        `with client.blob.registerOnly({ checkpoint, ... }).`
      : `Wallet has insufficient SUI for gas. Top up and retry with ` +
        `client.blob.registerOnly({ checkpoint, ... }).`;

  return new InsufficientGasError(
    friendly,
    checkpoint,
    requiredMist,
    address,
    { cause: err },
  );
}

/** Try to pull the newly-created BlobStore id out of transaction
 *  effects. Best-effort: not every signer surface returns effects, so
 *  we return `null` rather than throw if we can't find it. */
function findCreatedBlobStoreId(
  effects: any,
  packageId: string,
): string | null {
  if (!effects) return null;
  const expected = `${packageId === ""
    ? ""
    : packageId.startsWith("0x")
      ? packageId
      : `0x${packageId}`}::storage::BlobStore`;

  const created = effects.created;
  if (!Array.isArray(created)) return null;
  for (const c of created) {
    const objectType = c?.objectType ?? c?.object_type ?? c?.type;
    const objectId = c?.reference?.objectId ?? c?.objectId ?? c?.object_id;
    if (
      typeof objectType === "string" &&
      objectType.endsWith("::storage::BlobStore") &&
      // Also accept exact match against our deployed package
      (objectType === expected || objectType.endsWith("::storage::BlobStore")) &&
      typeof objectId === "string"
    ) {
      return objectId;
    }
  }
  return null;
}

export interface UploadApiContext {
  suiClient: unknown;
  packageId: string;
  network: WaldropNetwork;
  publisherUrl: string;
}

export async function uploadBlob(
  ctx: UploadApiContext,
  args: UploadBlobArgs,
): Promise<UploadBlobResult> {
  if (!args.data || args.data.byteLength === 0) {
    throw new WaldropError("upload: `data` is empty");
  }
  if (!Number.isFinite(args.epochs) || args.epochs <= 0) {
    throw new WaldropError("upload: `epochs` must be a positive number");
  }
  if (args.encrypted && !args.blobStoreId) {
    throw new WaldropError(
      "upload: encryption requires `blobStoreId` — encrypt-and-create-store " +
        "in one PTB is not supported by the contract. Create the BlobStore " +
        "first, then upload encrypted blobs into it.",
    );
  }

  const onProgress = args.onProgress;
  const sizeBytes = args.data.byteLength;
  const originalHash = await sha256(args.data);

  let uploadBytes = args.data;
  let sealMarkerHex: string | null = null;
  let sealMarkerBytes: Uint8Array | undefined;

  // 1. Encrypt (optional).
  if (args.encrypted && args.blobStoreId) {
    emit(onProgress, "encrypting", 10);
    const enc = await sealEncrypt(
      {
        suiClient: ctx.suiClient,
        packageId: ctx.packageId,
        network: ctx.network,
      },
      { data: args.data, blobStoreId: args.blobStoreId },
    );
    uploadBytes = enc.encryptedBytes;
    sealMarkerHex = enc.sealMarker;
    sealMarkerBytes = hexToBytes(enc.sealMarker);
  }

  // 2. Publisher PUT.
  emit(onProgress, "uploading", args.encrypted ? 35 : 20);
  const { blobId } = await uploadToWalrusPublisher({
    bytes: uploadBytes,
    epochs: args.epochs,
    publisherUrl: args.publisherUrl ?? ctx.publisherUrl,
    sendObjectTo: args.senderAddress,
    headers: args.publisherHeaders,
  });

  // 3. On-chain registration. If this throws, the bytes are already on
  //    Walrus — we wrap the failure in `RegistrationError` so the
  //    caller can retry registration only via `client.blob.registerOnly`.
  const checkpoint: UploadCheckpoint = {
    blobId,
    sizeBytes,
    contentHash: originalHash,
    fileName: args.fileName,
    contentType: args.contentType,
    encrypted: !!args.encrypted,
    sealMarker: sealMarkerHex ?? undefined,
  };

  return registerBlob(ctx, {
    checkpoint,
    epochs: args.epochs,
    senderAddress: args.senderAddress,
    subscriptionId: args.subscriptionId,
    signer: args.signer,
    blobStoreId: args.blobStoreId,
    initialShareViewers: args.initialShareViewers,
    onProgress,
  });
}

/** Run only the on-chain `register_blob` step using a checkpoint from
 *  a previous (failed-mid-register) upload attempt. Mirrors what
 *  `uploadBlob` does after the publisher PUT, so callers who caught
 *  `RegistrationError` can finish their upload without re-uploading
 *  bytes.
 *
 *  Safe to call repeatedly with the same checkpoint until the tx
 *  succeeds — Walrus storage is paid for at PUT time and survives
 *  failed register attempts. */
export async function registerBlob(
  ctx: UploadApiContext,
  args: RegisterBlobArgs,
): Promise<UploadBlobResult> {
  if (args.checkpoint.encrypted && !args.checkpoint.sealMarker) {
    throw new WaldropError(
      "registerBlob: encrypted checkpoint missing `sealMarker`",
    );
  }
  if (args.checkpoint.encrypted && !args.blobStoreId) {
    throw new WaldropError(
      "registerBlob: encrypted blobs require `blobStoreId` — the BlobStore " +
        "must already exist to scope the SEAL policy.",
    );
  }

  emit(args.onProgress, "registering", 75);
  const storedEpoch = await getCurrentSuiEpoch(ctx.suiClient);
  const expiryEpoch = storedEpoch + args.epochs;

  const sealMarkerBytes = args.checkpoint.sealMarker
    ? hexToBytes(args.checkpoint.sealMarker)
    : undefined;

  const meta = {
    blobId: args.checkpoint.blobId,
    sizeBytes: args.checkpoint.sizeBytes,
    storedEpoch,
    expiryEpoch,
    encrypted: args.checkpoint.encrypted,
    contentHash: args.checkpoint.contentHash,
    contentType: args.checkpoint.contentType,
    originalName: args.checkpoint.fileName,
    senderAddress: args.senderAddress,
    sealMarker: sealMarkerBytes,
    initialShareViewers: args.initialShareViewers,
  };

  const tx = args.blobStoreId
    ? buildRegisterBlobTx({
        ...meta,
        blobStoreId: args.blobStoreId,
        subscriptionId: args.subscriptionId,
      })
    : buildCreateAndRegisterBlobTx({
        ...meta,
        subscriptionId: args.subscriptionId,
      });

  let txResult: { digest: string; effects?: any };
  try {
    txResult = (await args.signer.signAndExecuteTransaction({
      transaction: tx,
    })) as { digest: string; effects?: any };
  } catch (err) {
    throw classifyRegisterError(err, args.checkpoint);
  }

  let resolvedStoreId: string | null = args.blobStoreId ?? null;
  if (!resolvedStoreId && txResult.effects) {
    resolvedStoreId = findCreatedBlobStoreId(txResult.effects, ctx.packageId);
  }

  emit(args.onProgress, "done", 100);

  return {
    blobId: args.checkpoint.blobId,
    sizeBytes: args.checkpoint.sizeBytes,
    storedEpoch,
    expiryEpoch,
    transactionDigest: txResult.digest,
    blobStoreId: resolvedStoreId,
    sealMarker: args.checkpoint.sealMarker ?? null,
  };
}

/** Pack `args.files` into a single tar, then run the same upload
 *  pipeline as a regular blob — the bundle is just bytes from
 *  Walrus's perspective. One publisher PUT + one on-chain tx, no
 *  matter how many files.
 *
 *  Mirrors the dapp's "bundle" upload strategy. To get the files back
 *  later, fetch the blob bytes and pass them through `unpackTar`. */
export async function uploadBundle(
  ctx: UploadApiContext,
  args: UploadBundleArgs,
): Promise<UploadBlobResult> {
  if (!args.files || args.files.length === 0) {
    throw new WaldropError("uploadBundle: `files` is empty");
  }

  const tar = packFilesAsTar(
    args.files.map((f) => ({ name: f.name, data: f.data })),
  );

  return uploadBlob(ctx, {
    ...args,
    data: tar.bytes,
    fileName: args.fileName ?? tar.name,
    contentType: tar.contentType,
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// Re-export TYPES so the effects parser doesn't need a second import in
// callers (we use the BlobStore fully-qualified type to recognise newly
// created stores).
export { TYPES };
