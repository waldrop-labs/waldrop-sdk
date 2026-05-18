// Typed error hierarchy. Catches in user code should narrow on these
// classes rather than string-matching error messages.

/** Base class for all errors thrown by the SDK. */
export class WaldropError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "WaldropError";
    if (options?.cause !== undefined) {
      // Node 16.9+ / modern browsers expose `cause`. We attach
      // unconditionally so logs always carry the underlying error.
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/** No `BlobStore` object owned by the queried address — user has not
 *  yet stored anything through Waldrop. */
export class BlobStoreNotFoundError extends WaldropError {
  constructor(public readonly owner: string) {
    super(`No Waldrop BlobStore found for owner ${owner}`);
    this.name = "BlobStoreNotFoundError";
  }
}

/** A specific blob_id was not found at the aggregator. */
export class BlobNotFoundError extends WaldropError {
  constructor(public readonly blobId: string) {
    super(`Blob not found at aggregator: ${blobId}`);
    this.name = "BlobNotFoundError";
  }
}

/** The Walrus aggregator returned an unexpected error response. */
export class AggregatorError extends WaldropError {
  constructor(
    public readonly status: number,
    public readonly bodyPreview: string,
  ) {
    super(`Walrus aggregator error (${status}): ${bodyPreview.slice(0, 200)}`);
    this.name = "AggregatorError";
  }
}

/** SEAL decryption failed — wrong policy id, missing access, or the
 *  bytes are not valid SEAL ciphertext. */
export class DecryptionError extends WaldropError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`Decryption failed: ${message}`, options);
    this.name = "DecryptionError";
  }
}

/** The optional `@mysten/seal` peer dependency is not installed.
 *  Users who only need `listBlobs` / `fetchBlob` can skip the install. */
export class SealNotInstalledError extends WaldropError {
  constructor() {
    super(
      "SEAL decryption requires `@mysten/seal`. Install it with: npm install @mysten/seal",
    );
    this.name = "SealNotInstalledError";
  }
}

/** State recovered after a successful publisher PUT but before / during
 *  on-chain registration. Pass back to `client.blob.registerOnly(...)`
 *  to finish the upload without re-uploading bytes. */
export interface UploadCheckpoint {
  /** Walrus blob_id returned by the publisher. */
  blobId: string;
  /** Size in bytes of the original (pre-encryption) data. */
  sizeBytes: number;
  /** SHA-256 of the original bytes (BlobRef `content_hash`). */
  contentHash: Uint8Array;
  /** Filename to record on-chain. */
  fileName: string;
  /** MIME type to record on-chain. */
  contentType: string;
  /** True iff the upload was SEAL-encrypted. */
  encrypted: boolean;
  /** 16-byte hex SEAL marker (only set when `encrypted`). */
  sealMarker?: string;
}

/** Thrown when the publisher PUT succeeded but the on-chain
 *  `register_blob` transaction failed. The bytes are already on Walrus
 *  — pass `checkpoint` to `client.blob.registerOnly(...)` to retry
 *  registration without re-uploading.
 *
 *  The Walrus storage is charged at PUT time, so failing to register
 *  doesn't waste storage tokens; it just means the on-chain BlobRef is
 *  missing and the blob won't appear in `client.blob.list()`. */
export class RegistrationError extends WaldropError {
  readonly checkpoint: UploadCheckpoint;
  constructor(
    message: string,
    checkpoint: UploadCheckpoint,
    options?: { cause?: unknown },
  ) {
    super(`Registration failed: ${message}`, options);
    this.name = "RegistrationError";
    this.checkpoint = checkpoint;
  }
}

/** Specialization of `RegistrationError` for the common case where the
 *  wallet ran out of SUI to pay gas. Catch this specifically to show
 *  a "top up your wallet" UI before falling through to the generic
 *  registration-failed handler.
 *
 *  Required gas budget (in MIST) is parsed from the underlying Sui RPC
 *  error when available; `null` when we couldn't parse it. */
export class InsufficientGasError extends RegistrationError {
  /** Required gas budget in MIST (1 SUI = 10^9 MIST). `null` if the
   *  underlying error didn't expose a number. */
  readonly requiredMist: number | null;
  /** The sender address whose balance was checked, when extractable. */
  readonly address: string | null;
  constructor(
    message: string,
    checkpoint: UploadCheckpoint,
    requiredMist: number | null,
    address: string | null,
    options?: { cause?: unknown },
  ) {
    super(message, checkpoint, options);
    this.name = "InsufficientGasError";
    this.requiredMist = requiredMist;
    this.address = address;
  }
}
