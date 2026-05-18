// Local round-trip test of the tar bundler — no network, no wallet.
// Pack 3 fake files, unpack the result, verify filenames + bytes
// survive.

import { packFilesAsTar, unpackTar } from "../src";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

const files = [
  { name: "a.csv", data: enc("id,name\n1,alice\n2,bob\n") },
  { name: "b.json", data: enc(JSON.stringify({ hello: "world" })) },
  { name: "c.txt", data: enc("plain text payload") },
];

const tar = packFilesAsTar(files);
console.log(`Packed: ${tar.name} (${tar.size} bytes, ${tar.contentType})`);

const unpacked = unpackTar(tar.bytes);
console.log(`Unpacked ${unpacked.length} entries:`);
for (const e of unpacked) {
  const original = files.find((f) => f.name === e.name);
  const match =
    original && original.data.length === e.bytes.length
      ? "✓"
      : "✗";
  console.log(`  ${match} ${e.name} (${e.size} bytes, ${e.contentType})`);
  console.log(`     ${dec(e.bytes).slice(0, 60)}`);
}
