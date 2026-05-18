// Walk a user's BlobStore Table and return decoded BlobRefs.
//
// On-chain shape:
//
//   BlobStore { id, owner, blobs: Table<String, BlobRef>, total_size_bytes, total_blobs }
//
// Tables store entries as dynamic fields under the table's own UID. The
// BlobStore object's `blobs` field only carries the Table's `{ id, size }`
// stub. To list blobs we must:
//
//   1. Find the user's BlobStore via `listOwnedObjects(TYPES.BlobStore)`
//   2. Pull the Table id from `blobStore.blobs.id.id`
//   3. Paginate `listDynamicFields({ parentId: tableId })`
//   4. `getDynamicField` for each name to get BCS-encoded BlobRef bytes
//   5. Decode + map to the public `BlobRef` shape

import {
  BlobStoreNotFoundError,
  WaldropError,
} from "../errors.js";
import type { BlobRef, BlobStoreSummary, ListBlobsArgs } from "../types.js";
import { formatSize, bytesToHex } from "../utils/format.js";
import { BlobRefBcs } from "./bcs.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tries the various JSON shapes the gRPC client might return for a
 *  `Table<String, _>` field, returning the inner Table id. */
function extractTableId(blobStoreJson: any): string | null {
  // Possible shapes:
  //   { blobs: { id: { id: "0x.." }, size: "N" } }   ← legacy fields-of-fields
  //   { blobs: { id: "0x..", size: "N" } }            ← flat
  //   { blobs: { fields: { id: { id: "0x.." } } } }   ← deeply nested
  const b = blobStoreJson?.blobs ?? blobStoreJson?.fields?.blobs;
  if (!b) return null;
  const fields = b.fields ?? b;
  const id = fields.id;
  if (typeof id === "string") return id;
  if (id && typeof id === "object") {
    if (typeof id.id === "string") return id.id;
    if (typeof id.id?.id === "string") return id.id.id;
  }
  return null;
}

/** Convert the raw BCS-decoded shape into the public `BlobRef`. The
 *  raw shape uses `bigint`/`string` for u64 fields and a number array
 *  for the content hash. */
function mapToPublic(raw: any): BlobRef {
  const sizeBytes = Number(raw.size_bytes ?? 0);
  const hashBytes =
    raw.content_hash instanceof Uint8Array
      ? raw.content_hash
      : Uint8Array.from(raw.content_hash ?? []);
  return {
    blobId: String(raw.blob_id ?? ""),
    sizeBytes,
    sizeDisplay: formatSize(sizeBytes),
    storedEpoch: Number(raw.stored_epoch ?? 0),
    expiryEpoch: Number(raw.expiry_epoch ?? 0),
    encrypted: Boolean(raw.encrypted),
    sealPolicyId: raw.seal_policy_id ? String(raw.seal_policy_id) : null,
    contentHashHex: bytesToHex(hashBytes),
    contentType: String(raw.content_type ?? ""),
    originalName: String(raw.original_name ?? ""),
  };
}

/** Look up the user's BlobStore object — returns null if they have
 *  none yet. Used internally by both `getBlobStore` and `listBlobs`. */
async function findBlobStore(
  client: any,
  owner: string,
  blobStoreType: string,
): Promise<{
  blobStoreId: string;
  totalSizeBytes: number;
  totalBlobs: number;
  json: any;
} | null> {
  const stores = await client.listOwnedObjects({
    owner,
    type: blobStoreType,
    include: { json: true },
    limit: 1,
  });
  const store = (stores?.objects as any[])?.[0];
  if (!store?.json) return null;
  return {
    blobStoreId: String(store.objectId ?? ""),
    totalSizeBytes: Number(store.json.total_size_bytes ?? 0),
    totalBlobs: Number(store.json.total_blobs ?? 0),
    json: store.json,
  };
}

/** Resolve summary info about the user's BlobStore (no Table walk). */
export async function getBlobStore(
  client: any,
  owner: string,
  blobStoreType: string,
): Promise<BlobStoreSummary> {
  const found = await findBlobStore(client, owner, blobStoreType);
  if (!found) throw new BlobStoreNotFoundError(owner);
  return {
    blobStoreId: found.blobStoreId,
    totalSizeBytes: found.totalSizeBytes,
    totalBlobs: found.totalBlobs,
    viewers: extractViewers(found.json),
  };
}

/** Return the viewer allowlist for `owner`'s BlobStore. Empty array
 *  when no BlobStore exists. */
export async function listViewers(
  client: any,
  owner: string,
  blobStoreType: string,
): Promise<string[]> {
  const found = await findBlobStore(client, owner, blobStoreType);
  if (!found) return [];
  return extractViewers(found.json);
}

/** True when `viewerAddress` is either the BlobStore's owner or on its
 *  viewer allowlist. Returns false (rather than throwing) when no
 *  BlobStore exists — easier for UI gating. */
export async function canView(
  client: any,
  owner: string,
  viewerAddress: string,
  blobStoreType: string,
): Promise<boolean> {
  if (owner === viewerAddress) return true;
  const found = await findBlobStore(client, owner, blobStoreType);
  if (!found) return false;
  return extractViewers(found.json).includes(viewerAddress);
}

/** Pull the `viewers: VecSet<address>` field from the BlobStore JSON.
 *  Sui's gRPC encodes `VecSet` as `{ contents: [...] }`. Defensive
 *  fallback returns `[]` if the field is missing in the RPC response. */
function extractViewers(blobStoreJson: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (blobStoreJson as any)?.viewers ?? (blobStoreJson as any)?.fields?.viewers;
  if (!v) return [];
  const contents = v.contents ?? v.fields?.contents ?? v;
  if (!Array.isArray(contents)) return [];
  return contents.map(String);
}

/** List all blobs registered by `owner`, newest-first. */
export async function listBlobs(
  client: any,
  blobStoreType: string,
  args: ListBlobsArgs,
): Promise<BlobRef[]> {
  const found = await findBlobStore(client, args.owner, blobStoreType);
  if (!found) throw new BlobStoreNotFoundError(args.owner);

  const tableId = extractTableId(found.json);
  if (!tableId) {
    throw new WaldropError(
      "Could not locate the BlobStore's inner Table id. The on-chain object shape may have changed.",
    );
  }

  const collected: BlobRef[] = [];
  let cursor: string | null | undefined = undefined;
  let page: any;

  do {
    page = await client.listDynamicFields({
      parentId: tableId,
      limit: DEFAULT_PAGE_SIZE,
      cursor: cursor ?? null,
    });

    const entries = (page?.dynamicFields ?? []) as Array<{
      name: { type: string; bcs: Uint8Array };
    }>;

    for (const entry of entries) {
      const result = await client.getDynamicField({
        parentId: tableId,
        name: entry.name,
      });
      const valueBcs = result?.dynamicField?.value?.bcs as Uint8Array | undefined;
      if (!valueBcs) continue;

      try {
        const ref = BlobRefBcs.parse(valueBcs);
        collected.push(mapToPublic(ref));
      } catch {
        // BCS decode failed — schema mismatch. Skip silently rather
        // than crashing the whole listing.
        continue;
      }

      if (args.limit && collected.length >= args.limit) {
        return collected.sort((a, b) => b.storedEpoch - a.storedEpoch);
      }
    }

    cursor = page?.cursor ?? null;
  } while (page?.hasNextPage);

  // Newest first — the Table walk order isn't guaranteed.
  collected.sort((a, b) => b.storedEpoch - a.storedEpoch);
  return collected;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
