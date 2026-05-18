// Example: estimate Walrus storage cost for a planned upload.
//
// Run:
//   bun examples/cost-estimate.ts
//
// No wallet required — reads the Walrus System object live and applies
// the same encoding-aware cost math the dapp uses.

import { WaldropClient } from "../src";

async function main() {
  const client = new WaldropClient({ network: "testnet" });

  // Forecast for a 10 MiB blob stored for 26 epochs (≈ 1 year on
  // mainnet, ≈ 26 days on testnet).
  const result = await client.cost.estimate({
    bytesPerBlob: 10 * 1024 * 1024,
    numBlobs: 1,
    epochs: 26,
  });

  if (!result.isAvailable) {
    console.warn(
      "Walrus pricing not loaded yet — the System object returned no usable price fields. Try again in a moment.",
    );
    return;
  }

  console.log(
    `Total:   ${result.totalWal.toFixed(6)} WAL (${result.totalFrost} FROST)`,
  );
  console.log(`Storage: ${result.storageFrost} FROST`);
  console.log(`Write:   ${result.writeFrost} FROST`);
  console.log(`Units:   ${result.totalUnits} × 1 MiB`);
  const epochLabel =
    result.pricing.epochDays > 0
      ? `epoch ${result.pricing.currentEpoch} · ${result.pricing.epochDays} day(s)/epoch`
      : `epoch ${result.pricing.currentEpoch}`;
  console.log(`Pricing: ${epochLabel}`);
  console.log(
    `         storage ${result.pricing.storagePricePerUnitFrost} FROST/unit/epoch`,
  );
  console.log(
    `         write   ${result.pricing.writePricePerUnitFrost} FROST/unit`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
