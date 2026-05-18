// Walrus publisher PUT — uploads bytes and returns the assigned
// `blob_id`. Mirrors the dapp's `/api/walrus?epochs=…` proxy except we
// hit the publisher directly (no Next.js route handler in front of it).
//
// Publishers respond with one of two shapes — the "newlyCreated" path
// when this is the first time the blob is uploaded, and the "alreadyCertified"
// path when an identical blob already exists on Walrus. Both expose
// `blobId` somewhere in the JSON; we walk both shapes.

import { WaldropError } from "../errors";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PublisherPutArgs {
  /** Bytes to upload (already SEAL-encrypted if encryption is enabled). */
  bytes: Uint8Array;
  /** Walrus epochs to store for. */
  epochs: number;
  /** Walrus publisher base URL — `https://publisher.…/v1/blobs` is
   *  appended. */
  publisherUrl: string;
  /** Sui address to receive the resulting Walrus Blob Sui object. Without
   *  this the publisher keeps the Blob in its own wallet — the user has
   *  no on-chain handle to delete or extend their storage later. */
  sendObjectTo: string;
  /** AbortSignal — propagate fetch cancellation. */
  signal?: AbortSignal;
  /** Extra HTTP headers to merge into the PUT — typically `Authorization:
   *  Bearer <jwt>` for authed publishers. Not needed for the public
   *  testnet publisher. */
  headers?: Record<string, string>;
}

export interface PublisherPutResult {
  blobId: string;
}

/** Walk the publisher's response shape to pull out the Walrus blob id.
 *  Publishers return one of:
 *    - { newlyCreated: { blobObject: { blobId } } }
 *    - { alreadyCertified: { blobId } }
 *  ...or, depending on version, the blobId at the root. Be lenient. */
function extractBlobId(json: any): string | null {
  if (!json || typeof json !== "object") return null;
  const candidates = [
    json.blobId,
    json.blob_id,
    json.newlyCreated?.blobObject?.blobId,
    json.newlyCreated?.blobObject?.blob_id,
    json.alreadyCertified?.blobId,
    json.alreadyCertified?.blob_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/** PUT `bytes` to a Walrus publisher and resolve the assigned `blob_id`.
 *  The publisher takes the bytes, erasure-codes them across storage
 *  nodes, certifies the blob on-chain, and returns the resulting blob
 *  id (a content-addressed hash). */
export async function uploadToWalrusPublisher(
  args: PublisherPutArgs,
): Promise<PublisherPutResult> {
  // Strip a trailing slash so `/v1/blobs` doesn't end up doubled.
  //
  // `deletable=true` is critical — without it the underlying Walrus
  // storage runs until `expiry_epoch` no matter what we do on-chain
  // later. Matches the dapp's `/api/walrus` proxy.
  const base = args.publisherUrl.replace(/\/+$/, "");
  const url =
    `${base}/v1/blobs?epochs=${args.epochs}&deletable=true` +
    `&send_object_to=${encodeURIComponent(args.sendObjectTo)}`;

  // The body slice strips any ArrayBuffer view offset/length so the
  // publisher gets exactly the bytes we mean to send. Important for
  // SEAL ciphertexts produced by sealClient.encrypt — they're shorter
  // than the parent ArrayBuffer in some Bun/Node combinations.
  const body = args.bytes.buffer.slice(
    args.bytes.byteOffset,
    args.bytes.byteOffset + args.bytes.byteLength,
  ) as ArrayBuffer;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(args.headers ?? {}),
      },
      body,
      signal: args.signal,
    });
  } catch (err) {
    throw new WaldropError(
      `Walrus publisher request failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new WaldropError(
      `Walrus publisher returned ${res.status}: ${detail || res.statusText}`,
    );
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new WaldropError("Walrus publisher returned non-JSON response");
  }

  const blobId = extractBlobId(json);
  if (!blobId) {
    throw new WaldropError(
      `Walrus publisher response missing blob_id: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }

  return { blobId };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
