// Example: upload a small file end-to-end — Walrus PUT + on-chain
// register_blob, signed by a local Ed25519 keypair.
//
// Run:
//   WALDROP_PRIVATE_KEY=suiprivkey1... \
//   WALDROP_SUBSCRIPTION_ID=0x... \
//   bun examples/upload-blob.ts
//
// Optional:
//   WALDROP_BLOB_STORE_ID=0x...     # existing store (skip first-upload create)
//   WALDROP_ENCRYPT=1               # SEAL-encrypt before upload (requires BlobStore)
//
// Notes:
//   - `WALDROP_PRIVATE_KEY` must be a Sui Bech32 secret (`suiprivkey…`)
//     with enough SUI for gas and a valid Subscription object.
//   - The example targets testnet by default (matching the deployed
//     Waldrop contracts).

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WaldropClient } from "../src";
import type { TransactionSigner } from "../src";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const privateKey = envOrThrow("WALDROP_PRIVATE_KEY");
  const subscriptionId = envOrThrow("WALDROP_SUBSCRIPTION_ID");
  const blobStoreId = process.env.WALDROP_BLOB_STORE_ID;
  const encrypt = process.env.WALDROP_ENCRYPT === "1";

  if (encrypt && !blobStoreId) {
    console.error(
      "WALDROP_ENCRYPT=1 requires WALDROP_BLOB_STORE_ID — the SEAL identity " +
        "is scoped to a BlobStore, so encrypted blobs need an existing store.",
    );
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const senderAddress = keypair.toSuiAddress();

  // Reuse the same SuiGrpcClient for signing as the SDK uses for reads,
  // so we hit one fullnode for the whole flow.
  const suiClient = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });

  // Adapter — the SDK accepts dapp-kit's `signAndExecuteTransaction`
  // shape; Node callers wrap their keypair + suiClient once.
  //
  // Two things matter here:
  //   1. `include: { effects: true }` — without this, the gRPC readMask
  //      omits `effects` so we lose the BlobStore id from the response.
  //   2. After execute, call `waitForTransaction` so the digest + effects
  //      are durable before we return (otherwise we race indexer lag).
  const signer: TransactionSigner = {
    async signAndExecuteTransaction({ transaction }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (suiClient as any).signAndExecuteTransaction({
        transaction: transaction as Transaction,
        signer: keypair,
        include: { effects: true },
      });
      const digest =
        result?.digest ??
        result?.transaction?.digest ??
        result?.effects?.transactionDigest ??
        "";
      // Block until the node has fully indexed the tx so the digest
      // is queryable on explorers immediately after this returns.
      if (digest) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (suiClient as any).waitForTransaction?.({ digest });
        } catch {
          // non-fatal — the tx is on-chain regardless
        }
      }
      return {
        digest,
        // Pass effects through so the SDK can pull the new BlobStore id.
        effects: result?.effects,
      } as { digest: string; effects?: unknown };
    },
  };

  const client = new WaldropClient({ network: "testnet", suiClient });

  // A small payload — adjust to taste.
  const payload = new TextEncoder().encode(
    `hello from waldrop-sdk @ ${new Date().toISOString()}\n` +
      `sender: ${senderAddress}\n` +
      `encrypted: ${encrypt}\n`,
  );

  console.log(`Uploading ${payload.byteLength} bytes from ${senderAddress}`);
  console.log(`  encrypt=${encrypt} blobStoreId=${blobStoreId ?? "(new store)"}`);

  const result = await client.blob.upload({
    data: payload,
    fileName: "hello.txt",
    contentType: "text/plain",
    epochs: 2,
    senderAddress,
    subscriptionId,
    signer,
    blobStoreId,
    encrypted: encrypt,
    onProgress: (e) =>
      console.log(`  [${e.stage}] ${e.percent}%`),
  });

  console.log("\n=== Upload complete ===");
  console.log(`blobId:      ${result.blobId}`);
  console.log(`sizeBytes:   ${result.sizeBytes}`);
  console.log(`storedEpoch: ${result.storedEpoch}`);
  console.log(`expiryEpoch: ${result.expiryEpoch}`);
  console.log(`blobStoreId: ${result.blobStoreId ?? "(not in effects)"}`);
  console.log(`sealMarker:  ${result.sealMarker ?? "(plaintext)"}`);
  console.log(`tx digest:   ${result.transactionDigest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
