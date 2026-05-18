// SEAL decryption helper. The `@mysten/seal` package is an *optional*
// peer dependency — users who only need `listBlobs` / `fetchBlob`
// shouldn't be forced to install it. We import lazily and surface a
// typed error when it's missing.

import { DecryptionError, SealNotInstalledError } from "../errors.js";
import type { DecryptBlobArgs } from "../types.js";

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

/** Decrypt SEAL-encrypted bytes. The `blobStoreId` acts as the SEAL
 *  policy scope — only an identity allowlisted by that BlobStore (i.e.
 *  the BlobStore's owner) can decrypt.
 *
 *  Wraps the various SEAL SDK error shapes into `DecryptionError` so
 *  catches in user code stay narrow. */
export async function sealDecrypt(args: DecryptBlobArgs): Promise<Uint8Array> {
  const seal = await loadSeal();
  if (!seal) throw new SealNotInstalledError();

  try {
    // SEAL's API surface is still in flux across versions. The dapp's
    // `useSeal` hook hides this; here we expose enough that consumers
    // can compose differently if they need to. The most common shape:
    //
    //   const client = new SealClient({ ... });
    //   const session = await client.createSessionKey({ signer });
    //   const plaintext = await client.decrypt({ ciphertext, policyId, session });
    //
    // We don't manage the SealClient lifecycle here — it's left to the
    // caller via `args.signer` because in a dapp it lives across many
    // decrypts and shouldn't be re-created per call. This helper is a
    // thin convenience that delegates the actual flow to whatever
    // `@mysten/seal` exposes today.
    if (typeof seal.decryptBlob !== "function") {
      throw new DecryptionError(
        "Installed @mysten/seal version does not export `decryptBlob`. " +
          "Either upgrade @mysten/seal, or call SealClient.decrypt() directly.",
      );
    }
    const plaintext = await seal.decryptBlob({
      ciphertext: args.bytes,
      policyId: args.blobStoreId,
      signer: args.signer,
    });
    if (!(plaintext instanceof Uint8Array)) {
      throw new DecryptionError("SEAL returned a non-Uint8Array result");
    }
    return plaintext;
  } catch (err) {
    if (err instanceof DecryptionError || err instanceof SealNotInstalledError) {
      throw err;
    }
    throw new DecryptionError(
      err instanceof Error ? err.message : "Unknown SEAL error",
      { cause: err },
    );
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
