"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiSpotify, SiYoutube } from "react-icons/si";
import { artistIdentity } from "@/lib/artists";
import type { DiscoveryMode, DiscoverySeed as Seed, DiscoveryTrack as PlaylistTrack } from "@/lib/discovery";
import { isMusicProvider, providerName, providerPlaylistEndpoint, providerSearchEndpoint, type MusicProvider as Destination } from "@/lib/providers";
import { isValidReplacement } from "@/lib/replacements";
import { createWorkspaceRecord, updateWorkspaceRecord, workspaceKey, type WorkspaceKey } from "@/lib/workspaces";

type CreatedPlaylist = { url: string; provider: Destination; skippedCount: number };
type Workspace = {
  seeds: Seed[];
  mood: string;
  size: number;
  tracks: PlaylistTrack[];
  reserve: PlaylistTrack[];
  name: string;
  warnings: string[];
  seenUris: string[];
  created: CreatedPlaylist | null;
};

const MOOD_EXAMPLES = ["Quiet focus", "Rainy jazz", "Confident night out", "Dreamy road trip", "Energetic workout"];

function emptyWorkspace(): Workspace {
  return { seeds: [], mood: "", size: 20, tracks: [], reserve: [], name: "Mood Mix — New Discoveries", warnings: [], seenUris: [], created: null };
}

function initialWorkspaces(): Record<WorkspaceKey, Workspace> {
  return createWorkspaceRecord(emptyWorkspace);
}

function moodPlaylistName(mood: string) {
  const words = mood.trim().split(/\s+/).slice(0, 5).join(" ");
  const title = words.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
  return title ? `${title} — Discoveries` : "Mood Mix — New Discoveries";
}

function uniqueUris(tracks: PlaylistTrack[]) {
  return [...new Set(tracks.map((track) => track.uri))];
}

export function PlaylistBuilder() {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [destination, setDestination] = useState<Destination>("spotify");
  const [mode, setMode] = useState<DiscoveryMode | null>(null);
  const [connected, setConnected] = useState<Record<Destination, boolean>>({ spotify: false, youtube: false });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Seed[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMix, setLoadingMix] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [replacingUri, setReplacingUri] = useState("");
  const [refilling, setRefilling] = useState(false);
  const [error, setError] = useState("");

  const activeMode = mode || "music";
  const activeKey = workspaceKey(destination, activeMode);
  const workspace = workspaces[activeKey];
  const providerConnected = connected[destination];
  const canGenerate = Boolean(mode) && providerConnected && !loadingMix && (mode === "music" ? workspace.seeds.length > 0 : workspace.mood.trim().length > 0);
  const previewArtistCount = useMemo(() => new Set(workspace.tracks.map((track) => artistIdentity(track.primaryArtist))).size, [workspace.tracks]);

  function updateWorkspace(key: WorkspaceKey, update: Partial<Workspace> | ((current: Workspace) => Workspace)) {
    setWorkspaces((current) => updateWorkspaceRecord(current, key, typeof update === "function" ? update : { ...current[key], ...update }));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedProvider = window.localStorage.getItem("moodmix_provider");
    if (isMusicProvider(savedProvider)) setDestination(savedProvider);
    if (params.get("youtube") === "failed" || params.get("spotify") === "failed") {
      const reference = params.get("reference");
      setError(`Provider authorization failed.${reference ? ` Reference: ${reference}.` : ""}`);
    }
    Promise.all([
      fetch("/api/auth/spotify/status").then((response) => response.json()),
      fetch("/api/auth/youtube/status").then((response) => response.json()),
    ]).then(([spotify, youtube]: Array<{ connected: boolean }>) => setConnected({ spotify: spotify.connected, youtube: youtube.connected })).catch(() => undefined);
  }, []);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) return setResults([]);
    setLoadingSearch(true);
    setError("");
    try {
      const response = await fetch(`${providerSearchEndpoint(destination)}?q=${encodeURIComponent(value)}&provider=${destination}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Search failed.");
      setResults(body.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t search music.");
    } finally {
      setLoadingSearch(false);
    }
  }

  function addSeed(seed: Seed) {
    if (workspace.seeds.some((item) => item.uri === seed.uri)) return setQuery("");
    if (workspace.seeds.length >= 5) return setError("You can use up to five music seeds.");
    updateWorkspace(activeKey, { seeds: [...workspace.seeds, seed] });
    setResults([]);
    setQuery("");
  }

  function generationPayload(current: Workspace, purpose: "playlist" | "replacement", excludeUris: string[] = []) {
    return {
      provider: destination,
      mode: activeMode,
      size: purpose === "replacement" ? 5 : current.size,
      seeds: activeMode === "music" ? current.seeds : undefined,
      mood: activeMode === "mood" ? current.mood : undefined,
      purpose,
      excludeUris,
    };
  }

  async function requestGeneration(payload: ReturnType<typeof generationPayload>) {
    const response = await fetch("/api/playlist/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const responseText = await response.text();
    let body: { error?: string; requestId?: string; tracks?: PlaylistTrack[]; reserve?: PlaylistTrack[]; warnings?: string[] } = {};
    try {
      body = responseText ? JSON.parse(responseText) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw new Error(`${body.error || `Playlist generation failed (HTTP ${response.status}).`}${body.requestId ? ` Reference: ${body.requestId}.` : ""}`);
    }
    if (!Array.isArray(body.tracks) || !Array.isArray(body.reserve) || !Array.isArray(body.warnings)) throw new Error("Playlist generation returned an invalid response.");
    return body as { tracks: PlaylistTrack[]; reserve: PlaylistTrack[]; warnings: string[] };
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (workspace.tracks.length && !workspace.created && !window.confirm("Generate a new mix and discard this unsaved draft?")) return;
    setLoadingMix(true);
    setError("");
    try {
      const body = await requestGeneration(generationPayload(workspace, "playlist"));
      const allTracks = [...body.tracks, ...body.reserve];
      updateWorkspace(activeKey, {
        tracks: body.tracks,
        reserve: body.reserve,
        warnings: body.warnings,
        seenUris: uniqueUris(allTracks),
        name: activeMode === "mood" ? moodPlaylistName(workspace.mood) : "Mood Mix — New Discoveries",
        created: null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t make your mix.");
    } finally {
      setLoadingMix(false);
    }
  }

  async function fetchReplacementBatch(current: Workspace, extraUris: string[] = []) {
    const excluded = [...new Set([...current.seenUris, ...uniqueUris(current.tracks), ...uniqueUris(current.reserve), ...extraUris])];
    return requestGeneration(generationPayload(current, "replacement", excluded));
  }

  async function refillReserve(key: WorkspaceKey, current: Workspace) {
    if (refilling) return;
    setRefilling(true);
    try {
      const body = await fetchReplacementBatch(current);
      updateWorkspace(key, (latest) => {
        const known = new Set([...latest.seenUris, ...uniqueUris(latest.tracks), ...uniqueUris(latest.reserve)]);
        const fresh = body.tracks.filter((track) => !known.has(track.uri));
        return { ...latest, reserve: [...latest.reserve, ...fresh], seenUris: [...new Set([...latest.seenUris, ...uniqueUris(fresh)])], warnings: [...new Set([...latest.warnings, ...body.warnings])] };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t refill replacements.");
    } finally {
      setRefilling(false);
    }
  }

  async function replaceTrack(index: number) {
    const removed = workspace.tracks[index];
    setReplacingUri(removed.uri);
    setError("");
    try {
      let pool = workspace.reserve;
      let replacement = pool.find((candidate) => isValidReplacement(candidate, removed, workspace.tracks, index));
      let warnings = workspace.warnings;
      if (!replacement) {
        const body = await fetchReplacementBatch(workspace, [removed.uri]);
        pool = [...pool, ...body.tracks];
        warnings = [...new Set([...warnings, ...body.warnings])];
        replacement = pool.find((candidate) => isValidReplacement(candidate, removed, workspace.tracks, index));
      }
      if (!replacement) throw new Error("We couldn’t find a valid replacement. Try again with broader input.");
      const nextTracks = workspace.tracks.map((track, trackIndex) => trackIndex === index ? replacement! : track);
      const nextReserve = pool.filter((track) => track.uri !== replacement!.uri);
      const next: Workspace = { ...workspace, tracks: nextTracks, reserve: nextReserve, warnings, seenUris: [...new Set([...workspace.seenUris, removed.uri, replacement.uri])], created: null };
      updateWorkspace(activeKey, next);
      if (nextReserve.length <= 1) void refillReserve(activeKey, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t replace that track.");
    } finally {
      setReplacingUri("");
    }
  }

  async function createPlaylist() {
    if (!providerConnected) return connectProvider(destination);
    setCreatingPlaylist(true);
    setError("");
    try {
      const payload = { name: workspace.name.trim() || "Mood Mix — New Discoveries", tracks: workspace.tracks.map(({ uri, name, artist }) => ({ uri, name, artist })) };
      const response = await fetch(providerPlaylistEndpoint(destination), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const playlist = await response.json();
      if (!response.ok) throw new Error(`${playlist.error || "Couldn’t create your playlist."}${playlist.requestId ? ` Reference: ${playlist.requestId}.` : ""}`);
      if (!playlist.url) throw new Error(`${providerName(destination)} created the playlist but did not return a link.`);
      updateWorkspace(activeKey, { created: { url: playlist.url, provider: destination, skippedCount: playlist.skippedCount || 0 } });
      window.location.assign(playlist.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t create your playlist.");
    } finally {
      setCreatingPlaylist(false);
    }
  }

  async function connectProvider(provider: Destination) {
    setError("");
    const response = await fetch(`/api/auth/${provider}/status`);
    const status = await response.json() as { configured?: boolean };
    if (!response.ok || !status.configured) {
      setError(`${providerName(provider)} is not configured on this deployment.`);
      return;
    }
    window.location.href = `/api/auth/${provider}`;
  }

  function chooseProvider(provider: Destination) {
    window.localStorage.setItem("moodmix_provider", provider);
    setDestination(provider);
    if (provider !== destination) setMode(null);
    setQuery("");
    setResults([]);
    setError("");
    if (!connected[provider]) void connectProvider(provider);
  }

  async function disconnectProvider(provider: Destination) {
    const response = await fetch(`/api/auth/${provider}/disconnect`, { method: "POST" });
    if (!response.ok) return setError(`Couldn’t disconnect ${providerName(provider)}.`);
    setConnected((current) => ({ ...current, [provider]: false }));
  }

  function changeMode(nextMode: DiscoveryMode) {
    setMode(nextMode);
    setQuery("");
    setResults([]);
    setError("");
  }

  return <main>
    <nav><a className="brand" href="/">mood<span>mix</span></a></nav>
    <section className="hero"><p className="eyebrow">DISCOVER SOMETHING NEW</p><h1>Choose your service.<br /><em>Find your next playlist.</em></h1><p className="intro">Connect a music provider, choose how you want to explore, and we’ll find artists outside your saved music.</p></section>
    <form className="workspace" onSubmit={generate}>
      <div className="step"><div className="step-number">01</div><div className="step-content"><p className="label">MUSIC PROVIDER</p><h2>Where do you listen?</h2><p className="help">Choose where you want to create the playlist.</p><ProviderButtons value={destination} connected={connected} onSelect={chooseProvider} onDisconnect={disconnectProvider} /></div></div>
      {providerConnected && <>
        <div className="rule" />
        <div className="step"><div className="step-number">02</div><div className="step-content"><p className="label">DISCOVERY MODE</p><h2>How should we start?</h2><ModeButtons value={mode} onSelect={changeMode} /></div></div>
        {mode && <><div className="rule" />
        <div className="step"><div className="step-number">03</div><div className="step-content">
          {mode === "music" ? <>
            <p className="label">BASED ON MUSIC</p><h2>What’s been on repeat?</h2><p className="help">Choose one to five artists, songs, or albums. Their artists will not appear in the mix.</p>
            <div className="search-wrap"><span className="search-icon">⌕</span><input value={query} onChange={(event) => void search(event.target.value)} placeholder="Search artists, songs, or albums" aria-label="Search artists, songs, or albums" />{loadingSearch && <span className="searching">Searching</span>}
              {results.length > 0 && <div className="results">{results.map((item) => <button type="button" className="result" onClick={() => addSeed(item)} key={item.uri}><SeedArtwork seed={item} /><span><strong>{item.name}</strong><small>{item.subtitle}</small></span><b>+</b></button>)}</div>}
            </div>
            <div className="chips">{workspace.seeds.map((seed) => <span className="chip" key={seed.uri}>{seed.name}<button type="button" aria-label={`Remove ${seed.name}`} onClick={() => updateWorkspace(activeKey, { seeds: workspace.seeds.filter((item) => item.uri !== seed.uri) })}>×</button></span>)}</div>
          </> : <>
            <p className="label">BASED ON A MOOD</p><h2>What should it feel like?</h2><p className="help">Describe a mood, activity, genre, or era in your own words.</p>
            <textarea className="mood-input" value={workspace.mood} onChange={(event) => updateWorkspace(activeKey, { mood: event.target.value })} placeholder="e.g. melancholic 90s trip-hop for a night drive" aria-label="Describe a mood" maxLength={160} />
            <div className="mood-examples">{MOOD_EXAMPLES.map((example) => <button type="button" onClick={() => updateWorkspace(activeKey, { mood: example })} key={example}>{example}</button>)}</div>
          </>}
        </div></div>
        <div className="generate-row"><LengthControl value={workspace.size} setValue={(size) => updateWorkspace(activeKey, { size })} /><div><span className="tiny">YOUR MIX WILL BE</span><strong>{workspace.size} tracks · at least {Math.ceil(workspace.size * 2 / 3)} new artists</strong></div><button className="generate" disabled={!canGenerate}>{loadingMix ? "Finding your sound…" : "Generate my mix"}<span>→</span></button></div></>}
      </>}
    </form>
    {error && <p className="error">{error}</p>}
    {mode && workspace.tracks.length > 0 && <section className="preview">
      <div className="preview-heading"><div><p className="eyebrow">YOUR DISCOVERY MIX</p><h2>{workspace.tracks.length} fresh discoveries</h2><p className="help">Featuring {previewArtistCount} new artists · {workspace.reserve.length} replacements ready{refilling ? " · finding more…" : ""}</p></div><button className="create" disabled={creatingPlaylist} onClick={() => void createPlaylist()}>{creatingPlaylist ? "Creating…" : `Create in ${providerName(destination)}`} <span>↗</span></button></div>
      <label className="playlist-name"><span>Playlist name</span><input value={workspace.name} onChange={(event) => updateWorkspace(activeKey, { name: event.target.value, created: null })} maxLength={100} /></label>
      {workspace.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      <ol>{workspace.tracks.map((track, index) => <li key={track.uri}><span className="index">{String(index + 1).padStart(2, "0")}</span>{track.image ? <img src={track.image} alt="" /> : <span className="cover" />}<span className="track"><b>{track.name}</b><small>{track.artist} · {track.album}</small></span><span className="track-actions"><button type="button" className="replace" disabled={Boolean(replacingUri)} onClick={() => void replaceTrack(index)}>{replacingUri === track.uri ? "Finding…" : "Replace"}</button><button type="button" className="remove" onClick={() => updateWorkspace(activeKey, { tracks: workspace.tracks.filter((_, trackIndex) => trackIndex !== index), created: null })}>Remove</button></span></li>)}</ol>
    </section>}
    <footer>MOOD MIX <span>✦</span> DISCOVER WITH INTENTION</footer>
  </main>;
}

function LengthControl({ value, setValue }: { value: number; setValue: (value: number) => void }) {
  return <div className="length-control"><span>Playlist length</span><div className="length-stepper"><button type="button" aria-label="Remove five tracks" disabled={value <= 10} onClick={() => setValue(value - 5)}>−</button><strong>{value} tracks</strong><button type="button" aria-label="Add five tracks" disabled={value >= 50} onClick={() => setValue(value + 5)}>+</button></div></div>;
}

function ModeButtons({ value, onSelect }: { value: DiscoveryMode | null; onSelect: (mode: DiscoveryMode) => void }) {
  return <div className="mode-buttons"><button type="button" className={value === "music" ? "selected" : ""} aria-pressed={value === "music"} onClick={() => onSelect("music")}><strong>Based on music</strong><span>Start with artists, songs, or albums</span></button><button type="button" className={value === "mood" ? "selected" : ""} aria-pressed={value === "mood"} onClick={() => onSelect("mood")}><strong>Based on a mood</strong><span>Describe the feeling in your own words</span></button></div>;
}

function ProviderButtons({ value, connected, onSelect, onDisconnect }: { value: Destination; connected: Record<Destination, boolean>; onSelect: (provider: Destination) => void; onDisconnect: (provider: Destination) => void }) {
  const providers = [{ id: "spotify" as const, icon: <SiSpotify aria-hidden="true" /> }, { id: "youtube" as const, icon: <SiYoutube aria-hidden="true" /> }];
  return <div className="provider-buttons">{providers.map((provider) => <div className="provider-choice" key={provider.id}><button type="button" className={`provider-button provider-${provider.id}${value === provider.id ? " selected" : ""}`} aria-pressed={value === provider.id} onClick={() => onSelect(provider.id)}><span className="provider-logo">{provider.icon}</span><strong>{providerName(provider.id)}</strong>{connected[provider.id] && <b aria-label="Connected">✓</b>}</button>{connected[provider.id] && <button type="button" className="disconnect" onClick={() => onDisconnect(provider.id)}>Disconnect</button>}</div>)}</div>;
}

function SeedArtwork({ seed }: { seed: Seed }) {
  const [failed, setFailed] = useState(false);
  const label = seed.type === "artist" ? "Artist" : seed.type === "album" ? "Album" : "Track";
  return <span className={`result-art${!seed.image || failed ? " fallback" : ""}`} role="img" aria-label={`${label} artwork`}>{seed.image && !failed ? <img src={seed.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-hidden="true">{label.slice(0, 2).toUpperCase()}</span>}</span>;
}
