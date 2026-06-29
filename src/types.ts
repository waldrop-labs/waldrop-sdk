// Public types exposed by the SDK. Mirrors the Move structs in
// `waldrop::storage::BlobRef` but in idiomatic TypeScript shape
// (camelCase, numbers/booleans/strings, ISO strings where useful).

import type { WaldropNetwork } from "./constants";
import type { UploadCheckpoint } from "./errors";

/** A single registered blob owned by a user. */
export interface BlobRef {
  /** Walrus blob_id — the content-addressed identifier. */
  blobId: string;
  /** On-chain registered size in bytes. */
  sizeBytes: number;
  /** Human-readable size (e.g. "1.23 MB"). */
  sizeDisplay: string;
  /** Sui epoch when the blob was first registered. */
  storedEpoch: number;
  /** Sui epoch when the storage reservation expires. */
  expiryEpoch: number;
  /** True if the blob is SEAL-encrypted. */
  encrypted: boolean;
  /** SEAL policy id (when `encrypted = true`), null otherwise. */
  sealPolicyId: string | null;
  /** SHA-256 of the original (pre-encryption) bytes, hex-encoded.
   *  Empty string for legacy blobs that didn't record a hash. */
  contentHashHex: string;
  /** MIME type recorded at registration. */
  contentType: string;
  /** Human-readable filename recorded at registration. */
  originalName: string;
}

/** Summary of a user's BlobStore object. */
export interface BlobStoreSummary {
  /** The Sui object id of the BlobStore. */
  blobStoreId: string;
  /** Total bytes stored across all of the user's blobs. */
  totalSizeBytes: number;
  /** Total number of registered blobs. */
  totalBlobs: number;
  /** Allowlisted viewer addresses (excludes owner). */
  viewers: string[];
}

/** Args for `client.blob.listViewers`. */
export interface ListViewersArgs {
  /** Sui address whose BlobStore to read. */
  owner: string;
}

/** Args for `client.blob.canView`. */
export interface CanViewArgs {
  /** Sui address whose BlobStore to read. */
  owner: string;
  /** Address whose access to check (typically the current wallet). */
  address: string;
}

/** Args for `client.subscription.get` / `isActive` / `daysUntilExpiry`. */
export interface GetSubscriptionArgs {
  /** Sui address whose subscription to look up. */
  owner: string;
}

/** Args for `client.subscription.daysUntilExpiry`. */
export interface DaysUntilExpiryArgs extends GetSubscriptionArgs {
  /** Walrus epoch duration in days. 1 on testnet, 14 on mainnet —
   *  read from the Walrus System object client-side. */
  epochDurationDays: number;
}

/** Subscription summary. */
export interface SubscriptionSummary {
  /** Sui object id of the Subscription. */
  subscriptionId: string;
  /** 0 = FREE, 1 = STARTER, 2 = PRO, 3 = ENTERPRISE. */
  planTier: number;
  /** Epoch the subscription started. */
  startedEpoch: number;
  /** Epoch the subscription expires. */
  expiresEpoch: number;
  /** 0 = ACTIVE, 1 = CANCELLED, 2 = EXPIRED, etc. */
  status: number;
}

/** Result of fetching a blob's bytes from a Walrus aggregator. */
export interface FetchedBlob {
  /** The raw bytes (still encrypted if the blob was registered as encrypted). */
  bytes: Uint8Array;
  /** MIME type returned by the aggregator (`Content-Type` header).
   *  Falls back to `application/octet-stream`. */
  contentType: string;
  /** Byte length of `bytes`. */
  sizeBytes: number;
}

/** Constructor options for {@link WaldropClient}. */
export interface WaldropClientOptions {
  /**
   * Network selector. Mainnet only. Defaults to `"mainnet"`.
   *
   * Independent of `suiGrpcUrl` / `walrusAggregatorUrl`: this just
   * picks which built-in default URL set to use. To use entirely
   * custom infrastructure, override the URL options below — the
   * `network` field can stay at its default.
   */
  network?: WaldropNetwork;

  /**
   * Custom Sui gRPC fullnode endpoint. Use this to:
   *   - Point at your own self-hosted fullnode
   *   - Use a regional / caching mirror for lower latency
   *   - Hit a private / staging network not in {@link SUI_GRPC_URLS}
   *
   * Default: per-network from {@link SUI_GRPC_URLS}.
   */
  suiGrpcUrl?: string;

  /**
   * Custom Walrus aggregator URL. Use this to:
   *   - Point at the public Walrus testnet aggregator
   *     (`https://aggregator.walrus-testnet.walrus.space`)
   *   - Use your own aggregator deployment
   *   - Use a CDN-fronted mirror
   *
   * Default: per-network from {@link WALRUS_AGGREGATOR_URLS}.
   */
  walrusAggregatorUrl?: string;

  /** Override the deployed Waldrop package id. Useful for self-hosted
   *  deployments or local devnets. Defaults to {@link PACKAGE_ID}. */
  packageId?: string;

  /**
   * Optional pre-built `SuiGrpcClient`. When provided, the SDK uses it
   * verbatim and ignores `network` / `suiGrpcUrl`. Required when
   * embedding the SDK inside a dapp that already has a configured
   * client (e.g. dapp-kit's `useCurrentClient`).
   */
  suiClient?: unknown;

  /** Default fetch timeout (ms) for the Walrus aggregator. Default: 30_000. */
  fetchTimeoutMs?: number;

  /** Walrus publisher URL — the write-side endpoint used by `client.blob.upload`.
   *  Default: per-network from {@link WALRUS_PUBLISHER_URLS}. */
  walrusPublisherUrl?: string;
}

/** Args for `client.listBlobs`. */
export interface ListBlobsArgs {
  /** Sui address whose BlobStore to read. */
  owner: string;
  /** Limit on the number of blobs to return (newest-first). Unlimited by default. */
  limit?: number;
}

/** Args for `client.getBlobStore`. */
export interface GetBlobStoreArgs {
  /** Sui address whose BlobStore to look up. */
  owner: string;
}

/** Args for `client.fetchBlob`. */
export interface FetchBlobArgs {
  /** Walrus blob_id to fetch. */
  blobId: string;
  /** Override the aggregator URL for this single call. */
  aggregatorUrl?: string;
  /** Per-call timeout (ms) — overrides the client default. */
  timeoutMs?: number;
}

/** Lifecycle stages emitted by `client.blob.upload`'s `onProgress` callback. */
export type UploadStage =
  | "encrypting"
  | "uploading"
  | "registering"
  | "done";

/** Single progress event passed to `client.blob.upload`'s `onProgress`. */
export interface UploadProgressEvent {
  /** Current stage of the upload pipeline. */
  stage: UploadStage;
  /** Coarse 0-100 percent — for driving a UI progress bar. */
  percent: number;
}

/** Minimal signer shape the SDK needs to register a blob on-chain.
 *  Matches dapp-kit's `dAppKit.signAndExecuteTransaction` shape so
 *  browser callers can pass dapp-kit directly. CLI / server callers
 *  can wrap a keypair signer in this shape — see `examples/upload-blob.ts`. */
export interface TransactionSigner {
  signAndExecuteTransaction(input: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: any;
  }): Promise<{ digest: string }>;
}

/** Args for `client.blob.upload`. */
export interface UploadBlobArgs {
  /** Plaintext bytes to upload. */
  data: Uint8Array;
  /** Filename recorded on-chain as `original_name`. */
  fileName: string;
  /** MIME type recorded on-chain as `content_type`. */
  contentType: string;
  /** Number of Walrus epochs to store for. */
  epochs: number;
  /** Sui address signing the on-chain registration transaction. */
  senderAddress: string;
  /** Subscription object id — required by `register_blob` to gate on
   *  plan tier (SEAL access, file-count cap, lifetime cap). */
  subscriptionId: string;
  /** Transaction signer. Pass dapp-kit's `dAppKit` directly in a dapp,
   *  or a small adapter around `SuiClient.signAndExecuteTransaction +
   *  Keypair` in Node. */
  signer: TransactionSigner;
  /** Existing BlobStore object id. Omit to create a new shared BlobStore
   *  in the same PTB as registration (first-upload path). */
  blobStoreId?: string;
  /** If true, SEAL-encrypt bytes before upload. Requires `blobStoreId`
   *  (encryption is scoped to a BlobStore). Defaults to false. */
  encrypted?: boolean;
  /** Override the Walrus publisher URL for this single upload. */
  publisherUrl?: string;
  /** Extra HTTP headers to merge into the publisher PUT — typically
   *  `{ Authorization: "Bearer <jwt>" }` for authed publishers. Not
   *  needed for the public testnet publisher (the SDK's default). */
  publisherHeaders?: Record<string, string>;
  /** Sui addresses to grant per-blob decrypt access at upload time.
   *  Bundled into the same PTB as `register_blob` so registration +
   *  sharing happen atomically (one signature). Ignored for plaintext
   *  uploads. */
  initialShareViewers?: string[];
  /** Called at each stage transition (encrypting → uploading →
   *  registering → done). UI hook for progress bars. */
  onProgress?: (event: UploadProgressEvent) => void;
}

/** A single file in a multi-file bundle upload. */
export interface BundleFile {
  /** Filename — preserved inside the tar so it survives unpack. */
  name: string;
  /** File bytes. */
  data: Uint8Array;
}

/** Args for `client.blob.uploadBundle`. Packs `files` into one tar and
 *  uploads it as a single Walrus blob (one publisher PUT + one on-chain
 *  tx, no matter how many files). Inherits everything from
 *  {@link UploadBlobArgs} except `data` / `fileName` / `contentType`,
 *  which are derived from the bundle. */
export interface UploadBundleArgs extends Omit<UploadBlobArgs, "data" | "fileName" | "contentType"> {
  /** Files to pack into the tar. Must contain at least one file. */
  files: BundleFile[];
  /** Override the bundle's filename (recorded on-chain as `original_name`).
   *  Defaults to `waldrop-bundle-<timestamp>.tar`. */
  fileName?: string;
}

/** Result of `client.blob.upload`. */
export interface UploadBlobResult {
  /** Walrus blob_id assigned by the publisher. */
  blobId: string;
  /** On-chain `original_size` (always equals `args.data.byteLength`). */
  sizeBytes: number;
  /** Sui epoch the blob was registered in. */
  storedEpoch: number;
  /** Sui epoch the storage reservation expires. */
  expiryEpoch: number;
  /** Sui digest of the register-blob transaction. */
  transactionDigest: string;
  /** BlobStore object id the blob landed in. New stores are created
   *  in the same PTB; this id is read from transaction effects post-execution
   *  and may be `null` if the digest doesn't include effects. */
  blobStoreId: string | null;
  /** 16-byte hex marker recorded on the BlobRef when encrypted = true.
   *  `null` for plaintext uploads. */
  sealMarker: string | null;
}

/** Args for `client.blob.registerOnly` — finishes a previously
 *  interrupted upload by running only the on-chain register step. The
 *  `checkpoint` typically comes from a caught `RegistrationError`. */
export interface RegisterBlobArgs {
  /** Recovered state from a previous upload attempt. */
  checkpoint: UploadCheckpoint;
  /** Walrus epochs of storage to record on-chain. */
  epochs: number;
  /** Sui address signing the registration. */
  senderAddress: string;
  /** Subscription object id — gates plan-tier checks. */
  subscriptionId: string;
  /** Transaction signer. */
  signer: TransactionSigner;
  /** Existing BlobStore object id. Required when the checkpoint is
   *  encrypted; omit for plaintext to create + register in one PTB. */
  blobStoreId?: string;
  /** Per-blob share viewers — bundled into the same PTB (ignored when
   *  the checkpoint is plaintext). */
  initialShareViewers?: string[];
  /** Stage-level progress callback. */
  onProgress?: (event: UploadProgressEvent) => void;
}

/** Args for `client.crypto.encrypt`. */
export interface EncryptBlobArgs {
  /** Plaintext bytes to encrypt. */
  data: Uint8Array;
  /** BlobStore object id that scopes this encryption — only that
   *  BlobStore's `seal_approve` (i.e. its owner or allowlisted viewers)
   *  can later decrypt. */
  blobStoreId: string;
}

/** Result of `client.crypto.encrypt`. */
export interface EncryptResult {
  /** Ciphertext bytes to upload to Walrus. */
  encryptedBytes: Uint8Array;
  /** 32-char hex (16 bytes) marker embedded in the SEAL identity.
   *  Record this on the on-chain BlobRef so per-blob share lookups
   *  can key off it. */
  sealMarker: string;
}

/** Args for `client.blob.extend` — atomic Walrus + Waldrop storage extension. */
export interface ExtendBlobArgs {
  /** Walrus blob_id (content-addressed). Used in the Waldrop `BlobRef`
   *  Table key — the contract looks up the on-chain metadata by this. */
  blobId: string;
  /** Sui object id of the Walrus `Blob<T>` object. Passed to Walrus's
   *  `extend_blob` Move call. Distinct from `blobId` (which is the
   *  content hash). Look up via `walrusClient.walrus.getBlob({ blobId })`
   *  or persist from upload. */
  walrusBlobObjectId: string;
  /** Number of additional Walrus epochs to extend storage by. */
  additionalEpochs: number;
  /** BlobStore object id holding the BlobRef whose expiry to bump. */
  blobStoreId: string;
  /** User's Subscription object id (`extend_blob` gates on plan's
   *  `max_walrus_epochs` so a Free user can't extend past their tier
   *  allowance). */
  subscriptionId: string;
  /** Sui address signing the transaction. Must equal the BlobStore owner
   *  and the Subscription owner. */
  senderAddress: string;
}

/** Result of `client.blob.extend`. */
export interface ExtendBlobResult {
  /** Digest of the combined Walrus + Waldrop extend transaction. */
  transactionDigest: string;
}

/** Args for `client.decryptBlob`. */
export interface DecryptBlobArgs {
  /** SEAL-encrypted bytes (typically from `fetchBlob`). */
  bytes: Uint8Array;
  /** The BlobStore object id this blob belongs to (acts as the SEAL policy scope). */
  blobStoreId: string;
  /**
   * A signer that can produce session keys for SEAL key-server access.
   * In the browser, pass dapp-kit's signer; in Node/CLI, a programmatic
   * signer compatible with `@mysten/sui`'s signing interface.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signer: any;
}
