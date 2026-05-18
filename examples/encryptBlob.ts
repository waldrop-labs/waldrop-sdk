// Example: SEAL-encrypt bytes under a BlobStore policy.
//
// Run:
//   bun examples/encrypt-blob.ts
//
// No wallet signature required for encryption — uses public key-server
// data only. The resulting `encryptedBytes` would normally be uploaded
// to Walrus, and `sealMarker` would be recorded on-chain in the BlobRef.
//
// Decryption later requires the BlobStore owner (or an allowlisted
// viewer) to sign a session key — see `examples/decrypt-blob.ts`.

import { WaldropClient } from "../src";

async function main() {
  const client = new WaldropClient({ network: "testnet" });

  // Any existing BlobStore on testnet. Use the address that owns the
  // store you want to encrypt against — the contract's `seal_approve`
  // is what gates decryption later. For this example we just need a
  // valid 32-byte object id; the encryption itself doesn't touch the
  // chain.
  const blobStoreId =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

  const plaintext = new TextEncoder().encode(
    "hello from waldrop-sdk — this is what an encrypted blob looks like before upload",
  );

  const { encryptedBytes, sealMarker } = await client.crypto.encrypt({
    data: plaintext,
    blobStoreId,
  });

  console.log(`Plaintext:    ${plaintext.byteLength} bytes`);
  console.log(`Ciphertext:   ${encryptedBytes.byteLength} bytes`);
  console.log(`SEAL marker:  0x${sealMarker}`);
  console.log(`(record marker on BlobRef so per-blob shares can find it)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
