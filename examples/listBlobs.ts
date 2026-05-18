// List a user's Waldrop-registered blobs.
//
// Usage:
//   bun examples/list-blobs.ts 0x9d655392521726d0eb26915670f7a37fe78b6fe001d133280ddaf57e4428aae1

import { WaldropClient, BlobStoreNotFoundError } from "../src/index";

const owner = process.argv[2];
if (!owner) {
  console.error("Usage: bun examples/list-blobs.ts <owner-address>");
  process.exit(1);
}

const waldrop = new WaldropClient({ network: "testnet" });

try {
  const summary = await waldrop.blob.getStore({ owner });
  console.log(`BlobStore: ${summary.blobStoreId}`);
  console.log(
    `Total: ${summary.totalBlobs} blobs / ${summary.totalSizeBytes} bytes`,
  );
  console.log("");

  const blobs = await waldrop.blob.list({ owner });
  if (blobs.length === 0) {
    console.log("(no blobs)");
    process.exit(0);
  }

  for (const b of blobs) {
    const lock = b.encrypted ? "🔒" : "  ";
    console.log(
      `${lock} ${b.originalName.padEnd(40)} ${b.sizeDisplay.padStart(10)} epoch ${b.storedEpoch} → ${b.expiryEpoch} · ${b.blobId.slice(0, 12)}…`,
    );
  }
} catch (err) {
  if (err instanceof BlobStoreNotFoundError) {
    console.log(
      `No BlobStore found for ${owner} — they haven't stored anything yet.`,
    );
    process.exit(0);
  }
  throw err;
}
