// Crypto-domain methods grouped under `client.crypto.*`:
//   - encrypt: SEAL-encrypt bytes under a BlobStore policy (no wallet
//              signing required — uses the key servers' public keys).
//   - decrypt: SEAL-decrypt previously encrypted bytes (requires a
//              wallet signer to produce a session key).
//
// The `@mysten/seal` package is an optional peer dep — both methods
// lazy-import it and throw `SealNotInstalledError` if it isn't
// installed.

import { sealEncrypt } from "./encrypt";
import { sealDecrypt } from "./seal";
import type { WaldropNetwork } from "../constants";
import type {
  DecryptBlobArgs,
  EncryptBlobArgs,
  EncryptResult,
} from "../types";

export interface CryptoApiContext {
  /** SuiGrpcClient shared with the parent WaldropClient. Used by SEAL
   *  to look up key servers. */
  suiClient: unknown;
  /** Waldrop Move package id — namespaces the `seal_approve` policy. */
  packageId: string;
  /** Network selector — picks which SEAL key servers to use. */
  network: WaldropNetwork;
}

export class CryptoApi {
  readonly #ctx: CryptoApiContext;

  constructor(ctx: CryptoApiContext) {
    this.#ctx = ctx;
  }

  /** Encrypt plaintext under a BlobStore's SEAL policy. Returns the
   *  ciphertext to upload to Walrus plus the 16-byte marker that must
   *  be recorded on-chain so per-blob share lookups can find it.
   *
   *  Requires the optional `@mysten/seal` peer dependency to be
   *  installed; throws `SealNotInstalledError` otherwise.
   *
   *  No wallet signature required — only public key server data is
   *  used. Same flow the dapp's wizard runs at upload time. */
  encrypt(args: EncryptBlobArgs): Promise<EncryptResult> {
    return sealEncrypt(
      {
        suiClient: this.#ctx.suiClient,
        packageId: this.#ctx.packageId,
        network: this.#ctx.network,
      },
      args,
    );
  }

  /** Decrypt SEAL-encrypted bytes — typically the result of a previous
   *  `client.blob.fetch()` for an encrypted blob.
   *
   *  Requires the optional `@mysten/seal` peer dependency to be
   *  installed; throws `SealNotInstalledError` otherwise.
   *
   *  `blobStoreId` acts as the SEAL policy scope — only an identity
   *  authorized by the BlobStore (typically its owner) can decrypt. */
  decrypt(args: DecryptBlobArgs): Promise<Uint8Array> {
    return sealDecrypt(args);
  }
}
