import { describe, expect, it } from "vitest";
import { readRequestText } from "../../lib/validation/request-body";

describe("bounded request bodies", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const request = new Request("http://localhost:3000/api", {
      body: "small",
      headers: { "Content-Length": "10" },
      method: "POST",
    });

    await expect(readRequestText(request, 4)).rejects.toThrow("BODY_TOO_LARGE");
  });

  it("rejects a streamed body that exceeds its limit", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"));
        controller.enqueue(new TextEncoder().encode("45"));
        controller.close();
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      body,
      duplex: "half",
      method: "POST",
    };
    const request = new Request("http://localhost:3000/api", init);

    await expect(readRequestText(request, 4)).rejects.toThrow("BODY_TOO_LARGE");
  });
});
