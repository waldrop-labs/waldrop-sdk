// Tar bundling — pack many files into one Walrus blob so multi-file
// uploads cost one publisher PUT + one on-chain register tx, no matter
// how many files. Mirrors the dapp's `lib/tar.ts` (same nanotar lib,
// same default filename pattern) but works with raw `Uint8Array` inputs
// instead of browser `File` objects so the SDK stays platform-neutral.
//
// On download, callers can `unpackTar(bytes)` to recover the individual
// files. Filenames and MIME types are preserved.

import { createTar, parseTar } from "nanotar";
import { WaldropError } from "../errors";

/** A single entry to include in the tar bundle. */
export interface BundleFileInput {
  /** Filename to record in the tar header. Preserved on unpack. */
  name: string;
  /** File bytes. */
  data: Uint8Array;
  /** Optional Unix mtime (seconds). Defaults to `Date.now() / 1000`. */
  mtime?: number;
}

/** A single entry recovered by `unpackTar`. */
export interface BundleEntry {
  /** Original filename from the tar header. */
  name: string;
  /** File size (matches `bytes.byteLength`). */
  size: number;
  /** Best-effort MIME type guessed from the filename extension. */
  contentType: string;
  /** File bytes. */
  bytes: Uint8Array;
}

/** Default filename pattern for the bundle blob — mirrors the dapp. */
function defaultBundleName(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  return `waldrop-bundle-${ts}.tar`;
}

/** Pack `files` into a single tar `Uint8Array`. Returns the tar bytes
 *  plus a default filename + MIME type, ready to feed into
 *  `client.blob.upload`. No compression — Walrus stores efficiently
 *  and gzip-in-the-browser would just add a slow read-path step. */
export function packFilesAsTar(files: BundleFileInput[]): {
  bytes: Uint8Array;
  name: string;
  size: number;
  contentType: string;
} {
  if (!files || files.length === 0) {
    throw new WaldropError("packFilesAsTar: no files to bundle");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const entries = files.map((f) => {
    if (!f.name) {
      throw new WaldropError("packFilesAsTar: every file needs a `name`");
    }
    if (!f.data || f.data.byteLength === 0) {
      throw new WaldropError(
        `packFilesAsTar: file "${f.name}" has no data`,
      );
    }
    return {
      name: f.name,
      data: f.data,
      attrs: {
        mtime: f.mtime ?? nowSeconds,
        // nanotar's default mode (0o644 = rw-r--r--) is fine.
      },
    };
  });

  const tarBytes = createTar(entries);

  return {
    bytes: tarBytes,
    name: defaultBundleName(),
    size: tarBytes.byteLength,
    contentType: "application/x-tar",
  };
}

/** Parse a tar blob (typically fetched back via `client.blob.fetch`)
 *  into its individual files. Drops malformed entries silently — the
 *  caller can compare `returned.length` against `files.length` to
 *  detect partial parses. */
export function unpackTar(bytes: Uint8Array): BundleEntry[] {
  const entries = parseTar(bytes);
  return entries
    .filter((e) => e.type === "file" && e.data && e.data.byteLength > 0)
    .map((e) => ({
      name: e.name,
      size: e.size ?? e.data!.byteLength,
      contentType: guessMimeFromName(e.name),
      bytes: e.data!,
    }));
}

function guessMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    jsonl: "application/x-ndjson",
    parquet: "application/octet-stream",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return map[ext] ?? "application/octet-stream";
}
