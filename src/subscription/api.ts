// Subscription-domain methods grouped under `client.subscription.*`.
// Read-only summaries + the on-chain view functions wrapped as
// async helpers (the SDK doesn't run Move directly — these reproduce
// the Move predicates in TypeScript against the parsed object state).

import { TYPES } from "../constants";
import type {
  DaysUntilExpiryArgs,
  GetSubscriptionArgs,
  SubscriptionSummary,
} from "../types";

const STATUS_ACTIVE = 0;
const STATUS_CANCELLED = 1;

/** Internal context — mirrors `BlobApiContext`. */
export interface SubscriptionApiContext {
  readonly suiClient: unknown;
  readonly subscriptionType: string;
}

async function findSubscription(
  client: any,
  owner: string,
  subscriptionType: string,
): Promise<SubscriptionSummary | null> {
  const owned = await client.listOwnedObjects({
    owner,
    type: subscriptionType,
    include: { json: true },
    limit: 1,
  });
  const sub = (owned?.objects as any[])?.[0];
  if (!sub?.json) return null;
  return {
    subscriptionId: String(sub.objectId ?? ""),
    planTier: Number(sub.json.plan_tier ?? 0),
    startedEpoch: Number(sub.json.started_epoch ?? 0),
    expiresEpoch: Number(sub.json.expires_epoch ?? 0),
    status: Number(sub.json.status ?? 0),
  };
}

export class SubscriptionApi {
  constructor(private readonly ctx: SubscriptionApiContext) {}

  /** Fetch the user's Subscription summary. Returns `null` if the
   *  user has no Subscription yet (i.e. never called `subscribe`). */
  async get(args: GetSubscriptionArgs): Promise<SubscriptionSummary | null> {
    return findSubscription(
      this.ctx.suiClient,
      args.owner,
      this.ctx.subscriptionType,
    );
  }

  /** Mirror of the Move `is_subscription_active(sub, current_epoch)`
   *  predicate. Returns `false` (not an error) when the user has no
   *  Subscription — easier for UI gating. */
  async isActive(
    args: GetSubscriptionArgs & { currentEpoch: number },
  ): Promise<boolean> {
    const sub = await this.get({ owner: args.owner });
    if (!sub) return false;
    const statusOk =
      sub.status === STATUS_ACTIVE || sub.status === STATUS_CANCELLED;
    return statusOk && sub.expiresEpoch > args.currentEpoch;
  }

  /** Whole epochs remaining until the subscription expires. Saturates
   *  at 0 once expired. Returns `0` for users with no subscription. */
  async epochsUntilExpiry(
    args: GetSubscriptionArgs & { currentEpoch: number },
  ): Promise<number> {
    const sub = await this.get({ owner: args.owner });
    if (!sub) return 0;
    return sub.expiresEpoch > args.currentEpoch
      ? sub.expiresEpoch - args.currentEpoch
      : 0;
  }

  /** Days remaining until expiry. Caller must supply
   *  `epochDurationDays` (1 on testnet, 14 on mainnet — read from the
   *  Walrus System object). Saturates at 0. */
  async daysUntilExpiry(
    args: DaysUntilExpiryArgs & { currentEpoch: number },
  ): Promise<number> {
    const remaining = await this.epochsUntilExpiry({
      owner: args.owner,
      currentEpoch: args.currentEpoch,
    });
    return remaining * args.epochDurationDays;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Compute the fully-qualified Subscription type for a given package id. */
export function subscriptionTypeForPackage(packageId: string): string {
  return packageId === TYPES.Subscription.split("::")[0]
    ? TYPES.Subscription
    : `${packageId}::subscription::Subscription`;
}
