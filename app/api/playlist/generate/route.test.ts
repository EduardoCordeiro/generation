import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifyApiError } from "@/lib/spotify";
import { withTransientRetry } from "./route";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("catalog retry behavior", () => {
  it("retries transient provider failures", async () => {
    vi.useFakeTimers();
    const task = vi.fn()
      .mockRejectedValueOnce(new SpotifyApiError("Unavailable", 503, "/search"))
      .mockResolvedValue("matched");

    const result = withTransientRetry(task);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("matched");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication or validation failures", async () => {
    const task = vi.fn().mockRejectedValue(new SpotifyApiError("Unauthorized", 401, "/search"));
    await expect(withTransientRetry(task)).rejects.toMatchObject({ status: 401 });
    expect(task).toHaveBeenCalledTimes(1);
  });
});
