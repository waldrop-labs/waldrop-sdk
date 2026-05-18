# Changelog

All notable changes to `waldrop-sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-18

### Added

- `WaldropClient` — the main entry point. Class-based with
  sub-namespaced domain APIs (`client.blob.*`, `client.crypto.*`).
- `client.blob.list({ owner })` — walk the on-chain `BlobStore.blobs`
  Table and return parsed `BlobRef` entries (newest-first).
- `client.blob.getStore({ owner })` — summary stats (BlobStore object
  id, total bytes, total blob count) without the per-entry walk.
- `client.blob.fetch({ blobId })` — GET the blob bytes from a Walrus
  aggregator with retry + timeout. Returns `Uint8Array` + content-type.
- `client.crypto.decrypt({ bytes, blobStoreId, signer })` — SEAL-decrypt
  blob bytes. Optional peer dependency on `@mysten/seal`.
- `isWaldropClient(x)` — type guard using a `Symbol.for` brand,
  realm-boundary safe.
- Custom error classes: `WaldropError`, `BlobNotFoundError`,
  `BlobStoreNotFoundError`, `DecryptionError`, `AggregatorError`,
  `SealNotInstalledError`.
- `sideEffects: false` in package.json for tree-shaking.

### Notes

- **Testnet only.** Mainnet `SUI_GRPC_URLS` / `WALRUS_AGGREGATOR_URLS`
  entries will be added once Waldrop contracts deploy to mainnet. In
  the meantime, custom URLs can be passed via `suiGrpcUrl` and
  `walrusAggregatorUrl` constructor options.

### Notes

- Read-only by design. Uploading and on-chain registration happen
  through the Waldrop dapp + CLI. SDK consumers who need to write
  should use `@mysten/sui` directly with the Waldrop contract package.
- Testnet defaults baked in. Override via `WaldropClient`'s
  constructor options for mainnet or custom infra.
