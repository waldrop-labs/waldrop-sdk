// Walrus aggregator GET. Streams the blob's raw bytes back. The
// aggregator returns the same bytes that were PUT — encrypted or not
// (encryption is applied by the publisher's caller, not Walrus itself).

import { AggregatorError, BlobNotFoundError, WaldropError } from "../errors";
import type { FetchBlobArgs, FetchedBlob } from "../types.js";
import { withRetry } from "../utils/retry.js";

export interface FetchBlobConfig {
  defaultAggregatorUrl: string;
  defaultTimeoutMs: number;
}

export async function fetchBlob(
  config: FetchBlobConfig,
  args: FetchBlobArgs,
): Promise<FetchedBlob> {
  const aggregator = (
    args.aggregatorUrl ?? config.defaultAggregatorUrl
  ).replace(/\/+$/, "");
  const url = `${aggregator}/v1/blobs/${encodeURIComponent(args.blobId)}`;
  const timeoutMs = args.timeoutMs ?? config.defaultTimeoutMs;

  return withRetry(
    async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let resp: Response;
      try {
        resp = await fetch(url, { method: "GET", signal: ctrl.signal });
      } catch (err) {
        clearTimeout(timer);
        throw new WaldropError(
          `Network error contacting aggregator at ${aggregator}`,
          { cause: err },
        );
      }
      clearTimeout(timer);

      if (resp.status === 404) {
        throw new BlobNotFoundError(args.blobId);
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new AggregatorError(resp.status, text);
      }

      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return {
        bytes,
        contentType:
          resp.headers.get("content-type") ?? "application/octet-stream",
        sizeBytes: bytes.byteLength,
      } satisfies FetchedBlob;
    },
    {
      attempts: 3,
      // 404 is permanent — don't waste retries.
      shouldRetry: (err) => !(err instanceof BlobNotFoundError),
    },
  );
}
