// SHA-256 helper for recording `content_hash` on the BlobRef. Uses
// WebCrypto (`crypto.subtle.digest`), which works in browsers, Node 19+,
// and Bun. Falls back are not needed for the SDK's runtime targets.

/** SHA-256 of `data`. Returns the 32-byte digest as a Uint8Array. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}
