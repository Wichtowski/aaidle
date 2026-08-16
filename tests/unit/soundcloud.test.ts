import { describe, expect, it } from "vitest";
import { normalizeSoundCloudUrl } from "../../src/lib/media/soundcloud";

describe("normalizeSoundCloudUrl", () => {
  it("accepts a public HTTPS SoundCloud track URL", () => {
    expect(normalizeSoundCloudUrl("https://soundcloud.com/example/track")).toBe(
      "https://soundcloud.com/example/track",
    );
  });

  it("rejects non-SoundCloud and insecure URLs", () => {
    expect(normalizeSoundCloudUrl("https://example.com/track")).toBeNull();
    expect(normalizeSoundCloudUrl("http://soundcloud.com/example/track")).toBeNull();
  });
});
