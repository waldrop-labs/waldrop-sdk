// Example: resume an upload that failed during on-chain registration.
//
// Why: the publisher PUT might succeed (Walrus has your bytes, you paid
// for storage) but the register tx might fail — wallet rejection,
// network blip, insufficient gas, plan-tier check, etc. Without resume
// you'd have to re-upload from scratch even though the bytes are
// already on Walrus.
//
// The SDK's pattern:
//   1. `upload()` throws a typed `RegistrationError` if the tx step fails
//   2. Its `.checkpoint` field has everything needed to retry the tx
//   3. Persist that checkpoint somewhere durable (file, DB, localStorage)
//   4. Call `registerOnly({ checkpoint, ... })` to finish without re-PUT
//
// Run (forces a tx failure by passing a bogus subscriptionId):
//   WALDROP_PRIVATE_KEY=suiprivkey1... \
//   WALDROP_SUBSCRIPTION_ID=0x... \
//   bun examples/resume-upload.ts

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WaldropClient, RegistrationError } from "../src";
import type { TransactionSigner, UploadCheckpoint } from "../src";

const CHECKPOINT_PATH = ".waldrop-resume-checkpoint.json";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// File-system checkpoint store. In a browser you'd swap this for
// localStorage / IndexedDB; in a server you'd use a DB row. The SDK
// doesn't care — it just hands you the checkpoint object on failure.
function saveCheckpoint(c: UploadCheckpoint) {
  // contentHash is a Uint8Array — JSON-encode the bytes so the
  // checkpoint round-trips intact.
  const serialised = {
    ...c,
    contentHash: Array.from(c.contentHash),
  };
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(serialised, null, 2));
  console.log(`✓ Checkpoint saved to ${CHECKPOINT_PATH}`);
}

function loadCheckpoint(): UploadCheckpoint | null {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  return {
    ...raw,
    contentHash: new Uint8Array(raw.contentHash),
  };
}

function clearCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    unlinkSync(CHECKPOINT_PATH);
    console.log(`✓ Checkpoint cleared`);
  }
}

async function main() {
  const privateKey = envOrThrow("WALDROP_PRIVATE_KEY");
  const subscriptionId = envOrThrow("WALDROP_SUBSCRIPTION_ID");

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

  // ── Resume path: checkpoint exists, just retry register_blob ─────────
  const existing = loadCheckpoint();
  if (existing) {
    console.log(
      `Resuming registration for blob ${existing.blobId} (${existing.sizeBytes} bytes)`,
    );
    const result = await client.blob.registerOnly({
      checkpoint: existing,
      epochs: 2,
      senderAddress,
      subscriptionId,
      signer,
    });
    console.log(`✓ Registered. tx digest: ${result.transactionDigest}`);
    clearCheckpoint();
    return;
  }

  // ── Fresh upload path ────────────────────────────────────────────────
  const payload = new TextEncoder().encode(
    `resume-test @ ${new Date().toISOString()}`,
  );
  console.log(`Fresh upload (${payload.byteLength} bytes)`);

  try {
    const result = await client.blob.upload({
      data: payload,
      fileName: "resume.txt",
      contentType: "text/plain",
      epochs: 2,
      senderAddress,
      subscriptionId,
      signer,
      onProgress: (e) => console.log(`  [${e.stage}] ${e.percent}%`),
    });
    console.log(`✓ Done in one shot. blobId: ${result.blobId}`);
  } catch (err) {
    if (err instanceof RegistrationError) {
      console.log(
        `✗ Register failed (bytes already on Walrus): ${err.message}`,
      );
      saveCheckpoint(err.checkpoint);
      console.log(
        `\nRun this example again to retry registration without re-uploading.`,
      );
      process.exit(0);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
