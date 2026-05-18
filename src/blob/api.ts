// Blob-domain methods grouped under `client.blob.*`. Each domain area
// is its own class instance hung off the main WaldropClient.

import { fetchBlob as _fetchBlob, type FetchBlobConfig } from "./fetch";
import {
  getBlobStore as _getBlobStore,
  listBlobs as _listBlobs,
  listViewers as _listViewers,
  canView as _canView,
} from "./list";
import {
  registerBlob as _registerBlob,
  uploadBlob as _uploadBlob,
  uploadBundle as _uploadBundle,
} from "../upload/api";
import { extendBlob as _extendBlob } from "./extend";
import type { WaldropNetwork } from "../constants";
import type {
  BlobRef,
  BlobStoreSummary,
  CanViewArgs,
  ExtendBlobArgs,
  ExtendBlobResult,
  FetchBlobArgs,
  FetchedBlob,
  GetBlobStoreArgs,
  ListBlobsArgs,
  ListViewersArgs,
  RegisterBlobArgs,
  TransactionSigner,
  UploadBlobArgs,
  UploadBlobResult,
  UploadBundleArgs,
} from "../types";

/** Internal interface the parent client implements — gives BlobApi
 *  access to whichever Sui client + aggregator config the parent was
 *  built with, without creating a circular import on WaldropClient. */
export interface BlobApiContext {
  readonly suiClient: unknown;
  readonly blobStoreType: string;
  readonly walrusAggregatorUrl: string;
  readonly walrusPublisherUrl: string;
  readonly fetchTimeoutMs: number;
  readonly packageId: string;
  readonly network: WaldropNetwork;
}

/** All read-side blob operations. Constructed once per WaldropClient
 *  and reused across calls — cheap (just stores a reference to the
 *  parent context). */
export class BlobApi {
  constructor(private readonly ctx: BlobApiContext) {}

  /** Look up the user's BlobStore summary (no Table walk).
   *
   *  Cheap call — useful when you only need totals (e.g. "Y MB stored
   *  across X blobs") for a header and don't want to pay the
   *  per-blob walk cost.
   *
   *  Throws `BlobStoreNotFoundError` if the user has no BlobStore yet. */
  getStore(args: GetBlobStoreArgs): Promise<BlobStoreSummary> {
    return _getBlobStore(this.ctx.suiClient, args.owner, this.ctx.blobStoreType);
  }

  /** List all of `owner`'s registered blobs, newest-first. Walks the
   *  on-chain `BlobStore.blobs` Table dynamic fields and BCS-decodes
   *  each `BlobRef`. Pass `limit` to early-exit pagination once enough
   *  entries are collected.
   *
   *  Throws `BlobStoreNotFoundError` if the user has no BlobStore yet. */
  list(args: ListBlobsArgs): Promise<BlobRef[]> {
    return _listBlobs(this.ctx.suiClient, this.ctx.blobStoreType, args);
  }

  /** Fetch a blob's bytes from the configured Walrus aggregator with
   *  retry + timeout. The bytes are returned exactly as they were
   *  uploaded — still encrypted if the blob was registered as
   *  encrypted (use `client.crypto.decrypt` after).
   *
   *  Throws `BlobNotFoundError` for 404, `AggregatorError` for other
   *  non-2xx responses. */
  fetch(args: FetchBlobArgs): Promise<FetchedBlob> {
    const config: FetchBlobConfig = {
      defaultAggregatorUrl: this.ctx.walrusAggregatorUrl,
      defaultTimeoutMs: this.ctx.fetchTimeoutMs,
    };
    return _fetchBlob(config, args);
  }

  /** Return the viewer allowlist for `owner`'s BlobStore. Owner is
   *  always implicit and is NOT included. Returns `[]` when the owner
   *  has no BlobStore yet.
   *
   *  Use this to render a "shared with…" panel in your UI. */
  listViewers(args: ListViewersArgs): Promise<string[]> {
    return _listViewers(this.ctx.suiClient, args.owner, this.ctx.blobStoreType);
  }

  /** True when `address` can decrypt blobs in `owner`'s BlobStore.
   *  Combines the owner check + viewer-allowlist check in one call —
   *  matches the on-chain `seal_approve` predicate. */
  canView(args: CanViewArgs): Promise<boolean> {
    return _canView(
      this.ctx.suiClient,
      args.owner,
      args.address,
      this.ctx.blobStoreType,
    );
  }

  /** Upload `data` to Walrus and register it on-chain in one call.
   *  Mirrors the dapp's wizard flow:
   *    1. SHA-256 of original bytes (recorded as `content_hash`)
   *    2. Optional SEAL encryption (when `encrypted: true` + `blobStoreId`)
   *    3. HTTP PUT to the configured Walrus publisher → returns `blob_id`
   *    4. PTB: `register_blob` (or `create_blob_store + register_blob`
   *       when `blobStoreId` is omitted), signed by `signer`.
   *
   *  Pass `onProgress` for stage-level progress updates (encrypting,
   *  uploading, registering, done). */
  upload(args: UploadBlobArgs): Promise<UploadBlobResult> {
    return _uploadBlob(
      {
        suiClient: this.ctx.suiClient,
        packageId: this.ctx.packageId,
        network: this.ctx.network,
        publisherUrl: this.ctx.walrusPublisherUrl,
      },
      args,
    );
  }

  /** Pack multiple files into a single tar and upload as ONE Walrus
   *  blob — one publisher PUT, one on-chain register tx. Files keep
   *  their filenames inside the tar; fetch the blob back and call
   *  `unpackTar(bytes)` to recover them.
   *
   *  Mirrors the dapp's "bundle" upload strategy. Best for grouping
   *  many small files or archival use; if you need per-file blob ids
   *  (e.g. independent sharing per file), call `upload()` per file
   *  instead. */
  uploadBundle(args: UploadBundleArgs): Promise<UploadBlobResult> {
    return _uploadBundle(
      {
        suiClient: this.ctx.suiClient,
        packageId: this.ctx.packageId,
        network: this.ctx.network,
        publisherUrl: this.ctx.walrusPublisherUrl,
      },
      args,
    );
  }

  /** Finish a previously-interrupted upload by running only the on-chain
   *  `register_blob` step. Typically called after catching a
   *  `RegistrationError` from `upload()` / `uploadBundle()`:
   *
   *  ```ts
   *  try {
   *    await client.blob.upload({ ... });
   *  } catch (e) {
   *    if (e instanceof RegistrationError) {
   *      // bytes are already on Walrus — retry just the tx
   *      await client.blob.registerOnly({
   *        checkpoint: e.checkpoint,
   *        epochs, senderAddress, subscriptionId, signer, blobStoreId,
   *      });
   *    }
   *  }
   *  ```
   *
   *  Safe to retry indefinitely — Walrus storage is paid at PUT time
   *  and persists across failed register attempts. */
  registerOnly(args: RegisterBlobArgs): Promise<UploadBlobResult> {
    return _registerBlob(
      {
        suiClient: this.ctx.suiClient,
        packageId: this.ctx.packageId,
        network: this.ctx.network,
        publisherUrl: this.ctx.walrusPublisherUrl,
      },
      args,
    );
  }

  /** Atomically extend a blob's Walrus storage AND sync Waldrop's
   *  on-chain `BlobRef.expiry_epoch`. Builds a single PTB containing
   *  both Move calls — either both succeed or both abort, so the dapp
   *  UI never drifts from real Walrus storage state.
   *
   *  Plan-tier enforcement: Waldrop's `storage::extend_blob` rejects
   *  extensions that would push the blob past `plan.max_walrus_epochs`
   *  for the user's current tier (SC29).
   *
   *  Requires `@mysten/walrus` to be installed (optional peer dep —
   *  lazy-imported so callers that never extend pay no bundle cost).
   *
   *  ```ts
   *  await client.blob.extend(
   *    {
   *      blobId,
   *      walrusBlobObjectId,
   *      additionalEpochs: 30,
   *      blobStoreId,
   *      subscriptionId,
   *      senderAddress,
   *    },
   *    dAppKit,
   *  );
   *  ``` */
  extend(args: ExtendBlobArgs, signer: TransactionSigner): Promise<ExtendBlobResult> {
    return _extendBlob(
      { suiClient: this.ctx.suiClient, packageId: this.ctx.packageId },
      args,
      signer,
    );
  }
}
