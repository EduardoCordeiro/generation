import { describe, expect, it } from "vitest";
import { createWorkspaceRecord, updateWorkspaceRecord, workspaceKey } from "./workspaces";

describe("provider and mode workspaces", () => {
  it("creates a distinct workspace for every provider and mode", () => {
    const workspaces = createWorkspaceRecord(() => ({ tracks: [] as string[] }));
    expect(Object.keys(workspaces)).toEqual(["spotify:music", "spotify:mood", "youtube:music", "youtube:mood"]);
    expect(workspaces["spotify:music"]).not.toBe(workspaces["spotify:mood"]);
  });

  it("updates one workspace without changing the others", () => {
    const workspaces = createWorkspaceRecord(() => ({ tracks: [] as string[] }));
    const key = workspaceKey("youtube", "mood");
    const next = updateWorkspaceRecord(workspaces, key, { tracks: ["new"] });
    expect(next[key].tracks).toEqual(["new"]);
    expect(next["spotify:music"]).toBe(workspaces["spotify:music"]);
  });
});
