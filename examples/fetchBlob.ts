// Fetch a blob's bytes from the Walrus aggregator and write them to disk.
//
// Usage:
//   bun examples/fetch-blob.ts <blob-id> [output-path]

import { writeFile } from "node:fs/promises";
import {
  WaldropClient,
  BlobNotFoundError,
  AggregatorError,
} from "../src/index";

const blobId = process.argv[2];
const outPath = process.argv[3] ?? "./blob.bin";
if (!blobId) {
  console.error("Usage: bun examples/fetch-blob.ts <blob-id> [output-path]");
  process.exit(1);
}

const waldrop = new WaldropClient({ network: "testnet" });

try {
  console.log(`Fetching ${blobId} from ${waldrop.walrusAggregatorUrl}…`);
  const { bytes, contentType, sizeBytes } = await waldrop.blob.fetch({
    blobId,
  });
  await writeFile(outPath, bytes);
  console.log(`Wrote ${sizeBytes} bytes (${contentType}) → ${outPath}`);
} catch (err) {
  if (err instanceof BlobNotFoundError) {
    console.error(`Blob not found: ${blobId}`);
    process.exit(1);
  }
  if (err instanceof AggregatorError) {
    console.error(`Aggregator returned ${err.status}:`, err.bodyPreview);
    process.exit(1);
  }
  throw err;
}
