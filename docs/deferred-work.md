# Deferred work

This document contains only product decisions intentionally postponed beyond the current MVP.

## Discovery modes

- Allow music seeds and a mood description to influence the same playlist. The MVP keeps “Based on music” and “Based on a mood” as separate flows.
- Consider AI-assisted mood interpretation if the deterministic English vocabulary proves too restrictive.
- Add an optional deep-cuts preference. The MVP favors representative tracks when introducing an unfamiliar artist.

## Language support

- Support mood descriptions in languages other than English.

## Sessions and workspace state

- Revisit the 24-hour provider-session lifetime if users need shorter or longer remembered connections.
- Persist provider × discovery-mode workspaces across page reloads and browser restarts. The MVP preserves them only while the page remains open.

## Artist identity

- Expand fuzzy artist-matching heuristics as real catalog edge cases are discovered. Keep normalization and matching isolated so this can evolve without changing playlist-selection logic.
