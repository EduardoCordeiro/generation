import type { DiscoveryMode } from "./discovery";
import type { MusicProvider } from "./providers";

export type WorkspaceKey = `${MusicProvider}:${DiscoveryMode}`;

export function workspaceKey(provider: MusicProvider, mode: DiscoveryMode): WorkspaceKey {
  return `${provider}:${mode}`;
}

export function createWorkspaceRecord<T>(factory: () => T): Record<WorkspaceKey, T> {
  return {
    "spotify:music": factory(),
    "spotify:mood": factory(),
    "youtube:music": factory(),
    "youtube:mood": factory(),
  };
}

export function updateWorkspaceRecord<T>(record: Record<WorkspaceKey, T>, key: WorkspaceKey, update: T | ((current: T) => T)) {
  return { ...record, [key]: typeof update === "function" ? (update as (current: T) => T)(record[key]) : update };
}
