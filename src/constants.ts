// Waldrop deployed contract IDs and default infrastructure URLs.
// Mirrored from `waldrop_app/src/config/contracts.ts` so the SDK can
// be used without depending on the dapp.
//
// ⚠️ Testnet-only for now. Mainnet support will be added once the
// contracts are deployed there. Custom RPC + aggregator URLs can be
// passed to the WaldropClient constructor in the meantime — see
// `WaldropClientOptions.suiGrpcUrl` and `.walrusAggregatorUrl`.

/** Sui Move package id for the Waldrop contracts on testnet.
 *  Redeployed 2026-05-17 (16:54 UTC) — refreshed Display<T> templates;
 *  carries all prior security cleanups (treasury rate-limit dropped,
 *  SEAL legacy identity dropped, amount_paid_usdc_equivalent dropped,
 *  register_quilt O(n) gas fix). Multi-coin pricing preserved via
 *  plan.prices VecMap. */
export const PACKAGE_ID =
  "0x829c3d2ae14ec3696bdb74d4f2c8e7dbfcd7cd8c4abc8b13109b94ef36e59a57";

/** Shared object IDs published alongside the package. */
export const SHARED_OBJECTS = {
  globalConfig:
    "0x883307bc567c2f2a343babc6ed53a2b5bd174626fb12024693031282db7bdb65",
  planRegistry:
    "0x410f9b9e47df988fb46c9e47df8e33a3c4e192ec358a69edd599b1fe1067acb2",
  treasury: "0xaf0db74ec17b325860ead9e05146e3448b3ddb3e7d422731ac8f6e55f99d17ec",
  loyaltyConfig:
    "0x14e65f584f22cafcd695af13035e13a4d48f3425fb50ad798c1c34b4ff2061f0",
  tokenPolicy:
    "0x4de1f32bafb8bade67a8694b1a73c3f6f544f5204d9b65798504bd1acf5123af",
  // Loyalty points coin Currency object (CoinRegistry::new_currency_with_otw).
  loyaltyCurrency:
    "0xe96d1f8fb31872f42c6ba5fc3f735c63dd20c863bbed0f28aa80851126b1bc33",
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

/** Networks the SDK supports. Currently testnet only — mainnet will
 *  be added when contracts are deployed there. */
export type WaldropNetwork = "testnet";

/** Default Sui gRPC endpoint. Override via `WaldropClientOptions.suiGrpcUrl`
 *  to point at your own fullnode, a regional caching mirror, etc. */
export const SUI_GRPC_URLS: Record<WaldropNetwork, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
};

/** Default Walrus aggregator URL. The aggregator is the read-side
 *  endpoint — fetches blob bytes by blob_id.
 *
 *  Override via `WaldropClientOptions.walrusAggregatorUrl` to point at
 *  your own aggregator, the public testnet one
 *  (`https://aggregator.walrus-testnet.walrus.space`), a regional
 *  caching mirror, etc. */
export const WALRUS_AGGREGATOR_URLS: Record<WaldropNetwork, string> = {
  testnet: "https://walrus.waldrop.xyz/aggregator",
};

/** Default Walrus publisher URL — the write-side endpoint used by
 *  `client.blob.upload`. Defaults to the public Walrus testnet publisher,
 *  which accepts unauthenticated requests. Override via
 *  `WaldropClientOptions.walrusPublisherUrl` (and pass `Authorization`
 *  via `UploadBlobArgs.publisherHeaders`) to use a JWT-authed publisher
 *  like the dapp's `https://walrus.waldrop.xyz/publisher`. */
export const WALRUS_PUBLISHER_URLS: Record<WaldropNetwork, string> = {
  testnet: "https://publisher.walrus-testnet.walrus.space",
};

/** Pagination cap when walking the BlobStore Table. Walrus aggregator
 *  responses can be large — keep page size modest so a single network
 *  hiccup doesn't cost too much retry work. */
export const DEFAULT_PAGE_SIZE = 50;

/** Default request timeout for blob fetches. Walrus aggregators can
 *  occasionally take a few seconds for cold reads. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** SEAL key server object ids per network. Two independent verified
 *  servers run by Mysten Labs / partners; threshold = 1 (any one of
 *  them suffices to recover the key). Mirrors the dapp's `useSeal`
 *  hook so SDK-encrypted bytes are decryptable by the dapp and vice
 *  versa.
 *
 *  https://seal-docs.wal.app/Pricing#verified-independent-server-type-key-servers
 */
export const SEAL_KEY_SERVERS: Record<WaldropNetwork, readonly string[]> = {
  testnet: [
    "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
  ],
};

/** SEAL threshold — number of key servers that must respond to recover
 *  the encryption key. The dapp uses 1; SDK-produced bytes must round-trip
 *  with the dapp, so this must match. */
export const SEAL_THRESHOLD = 1;
