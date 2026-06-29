// Waldrop deployed contract IDs and default infrastructure URLs.
// Mirrored from `waldrop_app/src/config/contracts.ts` so the SDK can
// be used without depending on the dapp.

/** Sui Move package id for the Waldrop contracts on mainnet.
 *  Redeployed 2026-06-28 (digest BZcHVS5GeMVFaNDRF4dAk7br9vYjzgyGRE657zfsL1a2)
 *  to ship the storage fix: `extend_blob` no longer asserts the bogus
 *  `expiry_epoch > ctx.epoch()` check that compared Walrus epochs (~14d)
 *  against Sui epochs (~24h). Walrus's own `extend_blob` PTB call
 *  enforces the real expiry guard. */
export const PACKAGE_ID =
  "0x42c1b5c270d2f583b7ba79c369e1e8213c050cbfa42dda4649519e2c196bdc93";

/** Shared object IDs published alongside the package. */
export const SHARED_OBJECTS = {
  globalConfig:
    "0x7562d6188b9fcb8812b92132d411558dc81f6bfb0cf4d994e4c3c0d75261eb61",
  planRegistry:
    "0x48a42c77d8d6a59e6ba8f731d38e7d37a856b4bee69e139c6d9f9ffb007c15fc",
  treasury: "0x3cd593984eb1e1df41d21c6f828e98bdb5f08ab95b99ee0d9179ef9e37ad9bd6",
  loyaltyConfig:
    "0x50e02d776a1cf9af79f835abf5aaff5604033c989bff4630423284dd140ba354",
  tokenPolicy:
    "0x09f977ff6fa129cba20e495832bed751945f40821dedf268b89ac8ca637bc8d9",
  // Loyalty points coin Currency object (CoinRegistry::new_currency_with_otw).
  loyaltyCurrency:
    "0x5aaf56f00f5b5f707eaa8dd37ecc914d2a0bfda0b38ae17adfdae07ff320ddb3",
} as const;

/** Fully-qualified Move types — used by Sui object queries. */
export const TYPES = {
  UserAccount: `${PACKAGE_ID}::subscription::UserAccount`,
  Subscription: `${PACKAGE_ID}::subscription::Subscription`,
  BlobStore: `${PACKAGE_ID}::storage::BlobStore`,
  MigrationJob: `${PACKAGE_ID}::migration::MigrationJob`,
  GlobalConfig: `${PACKAGE_ID}::admin::GlobalConfig`,
  PlanRegistry: `${PACKAGE_ID}::subscription::PlanRegistry`,
  LoyaltyConfig: `${PACKAGE_ID}::loyalty::LoyaltyConfig`,
} as const;

/** Networks the SDK supports. Mainnet only — testnet contracts are
 *  not maintained. */
export type WaldropNetwork = "mainnet";

/** Default Sui gRPC endpoint. Override via `WaldropClientOptions.suiGrpcUrl`
 *  to point at your own fullnode, a regional caching mirror, etc. */
export const SUI_GRPC_URLS: Record<WaldropNetwork, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

/** Default Walrus aggregator URL. The aggregator is the read-side
 *  endpoint — fetches blob bytes by blob_id.
 *
 *  Override via `WaldropClientOptions.walrusAggregatorUrl` to point at
 *  your own aggregator, a regional caching mirror, etc. */
export const WALRUS_AGGREGATOR_URLS: Record<WaldropNetwork, string> = {
  mainnet: "https://walrus.waldrop.xyz/aggregator",
};

/** Default Walrus publisher URL — the write-side endpoint used by
 *  `client.blob.upload`. Defaults to the Waldrop publisher (JWT-authed).
 *  Override via `WaldropClientOptions.walrusPublisherUrl` (and pass
 *  `Authorization` via `UploadBlobArgs.publisherHeaders`) to use a
 *  different publisher. */
export const WALRUS_PUBLISHER_URLS: Record<WaldropNetwork, string> = {
  mainnet: "https://walrus.waldrop.xyz/publisher",
};

/** Pagination cap when walking the BlobStore Table. Walrus aggregator
 *  responses can be large — keep page size modest so a single network
 *  hiccup doesn't cost too much retry work. */
export const DEFAULT_PAGE_SIZE = 50;

/** Default request timeout for blob fetches. Walrus aggregators can
 *  occasionally take a few seconds for cold reads. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** SEAL key server object ids. Mysten mainnet committee — 5-of-8 threshold
 *  aggregator. The dapp uses one entry (the aggregator handles the threshold
 *  internally); the SDK must round-trip with the dapp so this matches. */
export const SEAL_KEY_SERVERS: Record<WaldropNetwork, readonly string[]> = {
  mainnet: [
    "0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595",
  ],
};

/** SEAL threshold — number of key servers that must respond to recover
 *  the encryption key. The dapp uses 1; SDK-produced bytes must round-trip
 *  with the dapp, so this must match. */
export const SEAL_THRESHOLD = 1;
