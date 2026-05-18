# @waldrop/sdk

> TypeScript SDK for [Waldrop](https://waldrop.xyz) - upload, fetch, encrypt, and cost-estimate Walrus blobs on Sui.

[![npm version](https://img.shields.io/npm/v/@waldrop/sdk.svg)](https://www.npmjs.com/package/@waldrop/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A thin wrapper around the Walrus HTTP API and the Waldrop Sui contract. No dapp backend required.

## Install

```bash
bun add @waldrop/sdk @mysten/sui
# Optional - only for encrypt / decrypt
bun add @mysten/seal
```

## Quickstart

```ts
import { WaldropClient } from "@waldrop/sdk";

const waldrop = new WaldropClient({ network: "testnet" });

// List a user's blobs
const blobs = await waldrop.blob.list({ owner: "0x..." });

// Fetch one
const { bytes, contentType } = await waldrop.blob.fetch({
  blobId: blobs[0].blobId,
});
```

## What's in the box

```ts
// Upload
await waldrop.blob.upload({ data, fileName, contentType, epochs, signer });
await waldrop.blob.uploadBundle({ files: [...], signer });
await waldrop.blob.registerOnly({ blobId, ... }); // resume a failed upload

// Read
await waldrop.blob.list({ owner });             // → BlobRef[]
await waldrop.blob.fetch({ blobId });           // → { bytes, contentType }
await waldrop.blob.getStore({ owner });         // → summary stats

// Crypto (requires @mysten/seal)
await waldrop.crypto.encrypt({ data, blobStoreId });
await waldrop.crypto.decrypt({ bytes, blobStoreId, signer });

// Cost
await waldrop.cost.estimate({ bytesPerBlob, epochs });

// Sharing
await waldrop.blob.listViewers({ blobStoreId });
await waldrop.blob.canView({ blobStoreId, viewer });

// Subscription
await waldrop.subscription.get({ owner });
await waldrop.subscription.isActive({ owner });
```

## Upload example

The signer must be `@mysten/sui`'s `Signer` (or `Ed25519Keypair`). In a dapp, use dapp-kit's `signAndExecuteTransaction`; in a script, use an `Ed25519Keypair`.

```ts
import { WaldropClient } from "@waldrop/sdk";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const waldrop = new WaldropClient({ network: "testnet" });

const result = await waldrop.blob.upload({
  data: new TextEncoder().encode("hello waldrop"),
  fileName: "hello.txt",
  contentType: "text/plain",
  epochs: 5,
  signer: keypair,
});

console.log(result.blobId);
```

See [`examples/`](./examples) for more.

## Errors

The SDK throws typed errors you can narrow on:

```ts
import {
  WaldropError,
  BlobNotFoundError,
  DecryptionError,
  SealNotInstalledError,
  AggregatorError,
  InsufficientGasError,
} from "@waldrop/sdk";

try {
  await waldrop.blob.fetch({ blobId });
} catch (err) {
  if (err instanceof BlobNotFoundError) {
    // ...
  }
}
```

## Wallet signatures

Only **one** wallet prompt per upload — the on-chain `register_blob` call. SHA-256 hashing, SEAL encryption, and the Walrus publisher PUT all run without any signature.

Decryption requires one signature too (for the SEAL session key).

## Networks

Testnet defaults are baked in. Override for mainnet or custom infra:

```ts
new WaldropClient({
  network: "mainnet",
  suiGrpcUrl: "https://...",
  walrusAggregatorUrl: "https://...",
  walrusPublisherUrl: "https://...",
});
```

## Versioning

Semver. Anything not exported from `src/index.ts` is internal and may change between minor releases.

## License

[MIT](./LICENSE) © 2026 Waldrop
