// Tiny formatters — kept in their own file so test fixtures can import
// without dragging the rest of the SDK along.

/** Convert raw bytes to a human-readable size string (e.g. "1.23 MB"). */
export function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

/** Encode a `Uint8Array` (e.g. a content hash) as lowercase hex. Empty
 *  input yields the empty string — never `"0x"` — so callers can use
 *  truthiness checks without a special case. */
export function bytesToHex(bytes: Uint8Array | undefined | null): string {
  if (!bytes || bytes.length === 0) return "";
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}
