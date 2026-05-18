// Fetch + SEAL-decrypt an encrypted blob. Requires `@mysten/seal` to be
// installed and a signer that's allowlisted by the BlobStore policy.
//
// Usage:
//   bun examples/decrypt-blob.ts <blob-id> <blob-store-id>
//
// The signer here is hardcoded to a throwaway Ed25519 keypair — replace
// with your real signing setup (dapp-kit signer in browser, Ed25519Keypair
// imported from a seed/mnemonic in Node).

import { writeFile } from "node:fs/promises";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  WaldropClient,
  DecryptionError,
  SealNotInstalledError,
} from "../src/index";

const blobId = process.argv[2];
const blobStoreId = process.argv[3];
if (!blobId || !blobStoreId) {
  console.error(
    "Usage: bun examples/decrypt-blob.ts <blob-id> <blob-store-id>",
  );
  process.exit(1);
}

const waldrop = new WaldropClient({ network: "testnet" });

// Replace with the keypair owned by the BlobStore.
const signer = Ed25519Keypair.generate();

try {
  const { bytes } = await waldrop.blob.fetch({ blobId });
  console.log(`Got ${bytes.byteLength} encrypted bytes; decrypting…`);

  const plaintext = await waldrop.crypto.decrypt({
    bytes,
    blobStoreId,
    signer,
  });
  await writeFile("./decrypted.bin", plaintext);
  console.log(
    `Wrote ${plaintext.byteLength} plaintext bytes → ./decrypted.bin`,
  );
} catch (err) {
  if (err instanceof SealNotInstalledError) {
    console.error("Install @mysten/seal: npm install @mysten/seal");
    process.exit(1);
  }
  if (err instanceof DecryptionError) {
    console.error("Decryption failed:", err.message);
    process.exit(1);
  }
  throw err;
}
