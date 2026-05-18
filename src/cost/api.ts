// Cost-domain methods grouped under `client.cost.*`. Single entry
// point: `estimate(...)` — pulls live Walrus pricing and runs the
// dapp's exact cost math against it.
//
// No signer needed. No write side. Pure read + arithmetic.

import { calculateCost, type CostBreakdown } from "./calc";
import {
  readWalrusSystem,
  type WalrusNetwork,
  type WalrusSystemSnapshot,
} from "./system";

export interface CostApiContext {
  /** Sui gRPC client used to fetch the Walrus System object. */
  readonly suiClient: unknown;
  /** Which Walrus deployment to read. Defaults to "testnet". */
  readonly walrusNetwork: WalrusNetwork;
}

export interface EstimateArgs {
  /** Raw bytes per blob (single blob, or one of N in a batch). */
  bytesPerBlob: number;
  /** How many blobs will be created. Defaults to 1. */
  numBlobs?: number;
  /** Walrus epochs of storage requested. */
  epochs: number;
  /** Optional override for the pricing snapshot — pass this when you
   *  already have a snapshot in hand (e.g. cached at the UI level)
   *  to avoid a second on-chain read. */
  pricing?: WalrusSystemSnapshot;
}

export interface EstimateResult extends CostBreakdown {
  /** Pricing snapshot the math was applied against — useful for UI
   *  layers that want to render "based on epoch X, 1 day/epoch, …". */
  pricing: WalrusSystemSnapshot;
}

export class CostApi {
  constructor(private readonly ctx: CostApiContext) {}

  /** Forward-looking storage cost estimate. Reads the live Walrus
   *  System object for pricing (unless `pricing` is passed) and applies
   *  the same encoding-aware math the dapp uses. */
  async estimate(args: EstimateArgs): Promise<EstimateResult> {
    const pricing =
      args.pricing ??
      (await readWalrusSystem(this.ctx.suiClient, this.ctx.walrusNetwork));
    const breakdown = calculateCost({
      bytesPerBlob: args.bytesPerBlob,
      numBlobs: args.numBlobs ?? 1,
      epochs: args.epochs,
      storagePricePerUnitFrost: pricing.storagePricePerUnitFrost,
      writePricePerUnitFrost: pricing.writePricePerUnitFrost,
    });
    return { ...breakdown, pricing };
  }

  /** Just the Walrus System pricing snapshot, no cost math applied.
   *  Useful for displaying epoch duration / current epoch in your UI
   *  alongside cost. */
  async getPricing(): Promise<WalrusSystemSnapshot> {
    return readWalrusSystem(this.ctx.suiClient, this.ctx.walrusNetwork);
  }
}
