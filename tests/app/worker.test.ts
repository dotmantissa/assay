import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { sql, processNext } = vi.hoisted(() => ({
  sql: vi.fn(),
  processNext: vi.fn(),
}));
vi.mock("../../lib/db", () => ({ db: () => sql }));
vi.mock("../../lib/jobs", () => ({ processNext }));
import { runWorkerWindow } from "../../lib/worker";

describe("Hosted worker recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sql.mockResolvedValue([{ token: "held" }]);
  });
  afterEach(() => vi.useRealTimers());

  it("leaves work with the existing window when another trigger overlaps", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await runWorkerWindow()).toEqual({ advanced: 0 });
    expect(processNext).not.toHaveBeenCalled();
  });

  it("stops when the queue is empty and releases its window", async () => {
    processNext.mockResolvedValue(false);
    expect(await runWorkerWindow()).toEqual({ advanced: 0 });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("paces network work and leaves unfinished jobs for a later invocation", async () => {
    processNext.mockResolvedValue(true);
    const started = Date.now();
    const result = runWorkerWindow();
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ advanced: 27 });
    expect(Date.now() - started).toBe(208_000);
    expect(processNext).toHaveBeenCalledTimes(27);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("releases the window after a service failure so another trigger can resume", async () => {
    processNext.mockRejectedValue(new Error("RPC unavailable"));
    await expect(runWorkerWindow()).rejects.toThrow("RPC unavailable");
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
