const invalidContentLength = "INVALID_CONTENT_LENGTH";

function declaredContentLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (value === null) return null;

  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) throw new Error(invalidContentLength);
  return length;
}

export async function readRequestText(request: Request, maximumBytes: number): Promise<string> {
  const contentLength = declaredContentLength(request);
  if (contentLength !== null && contentLength > maximumBytes) throw new Error("BODY_TOO_LARGE");

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
