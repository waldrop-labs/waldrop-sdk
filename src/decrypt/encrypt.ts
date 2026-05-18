// SEAL encryption helper. Mirrors the dapp's `useSeal.encrypt` exactly
// so SDK-produced ciphertexts round-trip with dapp-produced ones (same
// key servers, same threshold, same 53-byte identity layout).
//
// Identity layout:
//   identity = store_id (32 bytes) || seal_marker (16 bytes) || nonce (5 bytes)
//                                                                 = 53 bytes
//
// The 16-byte `seal_marker` is what the on-chain BlobRef records so
// per-blob share lookups (`get_blob_share_viewers`) can find the right
// allowlist. The 5-byte nonce keeps SEAL identities unique even if two
// uploads happen to share a marker by accident. The Move contract's
// `seal_approve` also accepts the legacy 37-byte format (no marker)
// for backward compatibility with pre-upgrade blobs.

import { fromHex, toHex } from "@mysten/sui/utils";
import { SealNotInstalledError, WaldropError } from "../errors.js";
import { SEAL_KEY_SERVERS, SEAL_THRESHOLD } from "../constants.js";
import type { EncryptBlobArgs, EncryptResult } from "../types.js";
import type { WaldropNetwork } from "../constants.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

let _sealModule: any | undefined | null = undefined;

/** Lazy-load `@mysten/seal`. Cached after first call (positive or
 *  negative). Returns `null` if the package isn't installed. */
async function loadSeal(): Promise<any | null> {
  if (_sealModule !== undefined) return _sealModule;
  try {
    _sealModule = await import("@mysten/seal");
  } catch {
    _sealModule = null;
  }
  return _sealModule;
}

export interface SealEncryptContext {
  /** SuiGrpcClient used to construct the underlying SealClient. */
  suiClient: unknown;
  /** Waldrop package id — used as the SEAL `packageId`, which the
   *  contract's `seal_approve` is namespaced under. */
  packageId: string;
  /** Network selector — picks which key servers to use. */
  network: WaldropNetwork;
}

/** Encrypt `data` under the given BlobStore policy using SEAL. Returns
 *  the ciphertext to upload to Walrus, plus the 16-byte marker that
 *  must be recorded on the resulting BlobRef. */
export async function sealEncrypt(
  ctx: SealEncryptContext,
  args: EncryptBlobArgs,
): Promise<EncryptResult> {
  const seal = await loadSeal();
  if (!seal) throw new SealNotInstalledError();

  const SealClient = seal.SealClient;
  if (typeof SealClient !== "function") {
    throw new WaldropError(
      "Installed @mysten/seal version does not export `SealClient`. " +
        "Upgrade to @mysten/seal >= 0.5.",
    );
  }

  const servers = SEAL_KEY_SERVERS[ctx.network];
  const sealClient = new SealClient({
    suiClient: ctx.suiClient,
    serverConfigs: servers.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });

  // 16 marker bytes (recorded on-chain) + 5 nonce bytes (uniqueness only).
  const marker = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const idBytes = new Uint8Array([
    ...fromHex(args.blobStoreId),
    ...marker,
    ...nonce,
  ]);
  const id = toHex(idBytes);

  const { encryptedObject } = await sealClient.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: ctx.packageId,
    id,
    data: args.data,
  });

  if (!(encryptedObject instanceof Uint8Array)) {
    throw new WaldropError("SEAL returned a non-Uint8Array ciphertext");
  }

  return {
    encryptedBytes: encryptedObject,
    sealMarker: toHex(marker),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
