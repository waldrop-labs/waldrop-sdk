// Public API surface for `waldrop-sdk`. Anything not re-exported here
// is internal and may change between minor versions.

// Main entry point.
export { WaldropClient, isWaldropClient } from "./client";

// Sub-API classes — exposed so consumers can type method parameters
// like `(api: BlobApi) => void`. Constructed implicitly by the
// WaldropClient — you generally don't instantiate these directly.
export { BlobApi, type BlobApiContext } from "./blob/api";
export { CryptoApi, type CryptoApiContext } from "./decrypt/api";
export {
  SubscriptionApi,
  subscriptionTypeForPackage,
  type SubscriptionApiContext,
} from "./subscription/api";
export {
  CostApi,
  calculateCost,
  readWalrusSystem,
  WALRUS_SYSTEM_OBJECTS,
  type CostApiContext,
  type CostInputs,
  type CostBreakdown,
  type EstimateArgs,
  type EstimateResult,
  type WalrusSystemSnapshot,
  type WalrusNetwork,
} from "./cost";

// Constants — useful for building Sui transactions outside the SDK
// (e.g. if you want to call a Waldrop contract function directly).
export {
  PACKAGE_ID,
  SHARED_OBJECTS,
  TYPES,
  SUI_GRPC_URLS,
  WALRUS_AGGREGATOR_URLS,
  WALRUS_PUBLISHER_URLS,
  SEAL_KEY_SERVERS,
  SEAL_THRESHOLD,
  type WaldropNetwork,
} from "./constants";

// Upload helpers — exposed so power users can build their own
// upload flow (e.g. resume-from-blob_id, or registering an already-
// uploaded blob via a different path).
export {
  uploadToWalrusPublisher,
  type PublisherPutArgs,
  type PublisherPutResult,
} from "./upload/walrus";
export {
  buildRegisterBlobTx,
  buildCreateAndRegisterBlobTx,
  type BlobMetaParams,
  type RegisterBlobParams,
  type CreateAndRegisterBlobParams,
} from "./upload/transactions";
export { sha256 } from "./upload/hash";
export {
  packFilesAsTar,
  unpackTar,
  type BundleFileInput,
  type BundleEntry,
} from "./upload/tar";

// Types — the data shapes returned by SDK methods.
export type {
  BlobRef,
  BlobStoreSummary,
  FetchedBlob,
  WaldropClientOptions,
  ListBlobsArgs,
  GetBlobStoreArgs,
  FetchBlobArgs,
  DecryptBlobArgs,
  ListViewersArgs,
  CanViewArgs,
  GetSubscriptionArgs,
  DaysUntilExpiryArgs,
  SubscriptionSummary,
  EncryptBlobArgs,
  EncryptResult,
  UploadBlobArgs,
  UploadBlobResult,
  UploadBundleArgs,
  BundleFile,
  UploadStage,
  UploadProgressEvent,
  TransactionSigner,
  RegisterBlobArgs,
} from "./types";

// Errors — narrow on these in your `catch` blocks.
export {
  WaldropError,
  BlobStoreNotFoundError,
  BlobNotFoundError,
  AggregatorError,
  DecryptionError,
  SealNotInstalledError,
  RegistrationError,
  InsufficientGasError,
  type UploadCheckpoint,
} from "./errors";

// Utilities — exposed for callers who want to format sizes consistently
// or decode raw BlobRef BCS bytes (e.g. from event subscription).
export { formatSize, bytesToHex } from "./utils/format";
export { withRetry, type RetryOptions } from "./utils/retry";
export { BlobRefBcs, type RawBlobRef } from "./blob/bcs";

/** SDK semver — useful for telemetry / bug reports. Hand-edited; keep
 *  in sync with `package.json`. */
export const VERSION = "0.1.0";
