// Main client. Composes per-domain API classes (`blob`, `crypto`)
// under a single object so consumers don't have to wire them up
// themselves. Sub-namespaced methods (client.blob.list,
// client.crypto.decrypt, …) keep the top-level surface tidy as more
// domains land.

import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  PACKAGE_ID,
  SUI_GRPC_URLS,
  WALRUS_AGGREGATOR_URLS,
  WALRUS_PUBLISHER_URLS,
  DEFAULT_FETCH_TIMEOUT_MS,
  TYPES,
} from "./constants";
import { BlobApi } from "./blob/api";
import { CostApi } from "./cost/api";
import { CryptoApi } from "./decrypt/api";
import { SubscriptionApi, subscriptionTypeForPackage } from "./subscription/api";
import type { WaldropClientOptions } from "./types";

/** Brand symbol used by `isWaldropClient` to safely type-narrow an
 *  `unknown` value into a WaldropClient — works across realm
 *  boundaries (multiple npm copies, iframes, web workers). */
const WALDROP_CLIENT_BRAND = Symbol.for("@waldrop/WaldropClient");

/** Type guard — returns true if `value` is a `WaldropClient` instance,
 *  even across realm boundaries (multiple npm copies, iframes, etc.).
 *  More robust than `instanceof` for SDK consumers. */
export function isWaldropClient(value: unknown): value is WaldropClient {
  return (
    typeof value === "object" &&
    value !== null &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (value as any)[WALDROP_CLIENT_BRAND] === true
  );
}

export class WaldropClient {
  /** Underlying Sui gRPC client used for on-chain reads. Exposed so
   *  consumers can run arbitrary Sui queries that the SDK doesn't
   *  cover (events, dynamic fields, etc.). */
  readonly suiClient: SuiGrpcClient;

  /** Walrus aggregator base URL — used for blob byte fetches. */
  readonly walrusAggregatorUrl: string;

  /** Walrus publisher base URL — used by `client.blob.upload`. */
  readonly walrusPublisherUrl: string;

  /** Waldrop Move package id — used to construct fully-qualified
   *  Move types. */
  readonly packageId: string;

  /** Default per-call HTTP timeout (ms) for Walrus aggregator fetches. */
  readonly fetchTimeoutMs: number;

  /** Blob-domain operations: `client.blob.list()`, `.fetch()`, `.getStore()`,
   *  `.listViewers()`, `.canView()`. */
  readonly blob: BlobApi;

  /** Crypto-domain operations: `client.crypto.decrypt()`. */
  readonly crypto: CryptoApi;

  /** Subscription-domain operations: `client.subscription.get()`,
   *  `.isActive()`, `.epochsUntilExpiry()`, `.daysUntilExpiry()`. */
  readonly subscription: SubscriptionApi;

  /** Cost-domain operations: `client.cost.estimate()`, `.getPricing()`.
   *  Reads live Walrus System pricing and runs the same math the
   *  dapp's wizard / files page renders. */
  readonly cost: CostApi;

  /** Brand marker — see `isWaldropClient`. */
  get [WALDROP_CLIENT_BRAND]() {
    return true;
  }

  constructor(options: WaldropClientOptions = {}) {
    const network = options.network ?? "testnet";

    // Caller-supplied SuiClient wins (lets dapps reuse a dapp-kit
    // client). Otherwise build one from network defaults.
    this.suiClient = options.suiClient
      ? (options.suiClient as SuiGrpcClient)
      : new SuiGrpcClient({
          network,
          baseUrl: options.suiGrpcUrl ?? SUI_GRPC_URLS[network],
        });

    this.walrusAggregatorUrl =
      options.walrusAggregatorUrl ?? WALRUS_AGGREGATOR_URLS[network];
    this.walrusPublisherUrl =
      options.walrusPublisherUrl ?? WALRUS_PUBLISHER_URLS[network];
    this.packageId = options.packageId ?? PACKAGE_ID;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    // Sub-API instances see the parent's state via a context object —
    // this keeps the sub-classes free of any reference to WaldropClient
    // itself, so they're easy to test in isolation.
    this.blob = new BlobApi({
      suiClient: this.suiClient,
      blobStoreType: this.blobStoreType,
      walrusAggregatorUrl: this.walrusAggregatorUrl,
      walrusPublisherUrl: this.walrusPublisherUrl,
      fetchTimeoutMs: this.fetchTimeoutMs,
      packageId: this.packageId,
      network,
    });
    this.crypto = new CryptoApi({
      suiClient: this.suiClient,
      packageId: this.packageId,
      network,
    });
    this.subscription = new SubscriptionApi({
      suiClient: this.suiClient,
      subscriptionType: subscriptionTypeForPackage(this.packageId),
    });
    // Cost queries — needs the same Sui client, plus the Walrus network
    // hint so it knows which System object to read.
    this.cost = new CostApi({
      suiClient: this.suiClient,
      walrusNetwork: network,
    });
  }

  /** Fully-qualified Move type for the BlobStore object, computed
   *  from the (possibly overridden) package id. Cached at construction
   *  via the sub-API context.
   *
   *  Most callers don't need this directly — it's exposed for users
   *  who want to run their own `listOwnedObjects(type: …)` query. */
  get blobStoreType(): string {
    return this.packageId === PACKAGE_ID
      ? TYPES.BlobStore
      : `${this.packageId}::storage::BlobStore`;
  }
}
