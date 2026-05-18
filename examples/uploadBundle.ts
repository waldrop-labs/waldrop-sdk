// Example: pack 3 files into a tar and upload as a single Walrus blob.
// One publisher PUT, one on-chain register_blob tx, no matter how many
// files. Mirrors the dapp's "bundle" upload strategy.
//
// Run:
//   WALDROP_PRIVATE_KEY=suiprivkey1... \
//   WALDROP_SUBSCRIPTION_ID=0x... \
//   bun examples/upload-bundle.ts
//
// To fetch + unpack later:
//   const { bytes } = await client.blob.fetch({ blobId });
//   const entries = unpackTar(bytes);
//   for (const e of entries) console.log(e.name, e.size);

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

  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const senderAddress = keypair.toSuiAddress();

  const suiClient = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });

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
      if (digest) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (suiClient as any).waitForTransaction?.({ digest });
        } catch {
          /* non-fatal */
        }
      }
      return { digest, effects: result?.effects } as {
        digest: string;
        effects?: unknown;
      };
    },
  };

  const client = new WaldropClient({ network: "testnet", suiClient });

  const enc = (s: string) => new TextEncoder().encode(s);
  const files = [
    {
      name: "users.csv",
      data: enc("id,name,email\n1,alice,alice@example.com\n2,bob,bob@example.com\n"),
    },
    {
      name: "config.json",
      data: enc(JSON.stringify({ env: "demo", version: 1 }, null, 2)),
    },
    {
      name: "README.md",
      data: enc(
        `# Demo bundle\nUploaded ${new Date().toISOString()} via waldrop-sdk.\n`,
      ),
    },
  ];

  const totalBytes = files.reduce((s, f) => s + f.data.byteLength, 0);
  console.log(
    `Bundling ${files.length} files (${totalBytes} bytes) into one tar`,
  );

  const result = await client.blob.uploadBundle({
    files,
    epochs: 2,
    senderAddress,
    subscriptionId,
    signer,
    blobStoreId,
    onProgress: (e) => console.log(`  [${e.stage}] ${e.percent}%`),
  });

  console.log("\n=== Bundle upload complete ===");
  console.log(`blobId:      ${result.blobId}`);
  console.log(`sizeBytes:   ${result.sizeBytes}  (tar overhead included)`);
  console.log(`expiryEpoch: ${result.expiryEpoch}`);
  console.log(`blobStoreId: ${result.blobStoreId ?? "(not in effects)"}`);
  console.log(`tx digest:   ${result.transactionDigest}`);
  console.log(`\nFetch back with:`);
  console.log(`  const { bytes } = await client.blob.fetch({ blobId: "${result.blobId}" });`);
  console.log(`  const entries = unpackTar(bytes);`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
