"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiSpotify, SiYoutube } from "react-icons/si";
import { providerName, providerPlaylistEndpoint, providerSearchEndpoint, type MusicProvider as Destination } from "@/lib/providers";

type Seed = { id: string; uri: string; name: string; subtitle: string; type: "artist" | "album" | "track"; artists?: string[]; image?: string };
type Result = Seed;
type PlaylistTrack = { uri: string; name: string; artist: string; primaryArtist: string; album: string; image?: string };
type CreatedPlaylist = { url: string; provider: Destination; skippedCount: number };

const mockSeeds: Seed[] = [
  { id: "a1", uri: "spotify:artist:5K4W6rqBFWDnAN6FQUkS6x", name: "Solange", subtitle: "Artist", type: "artist", artists: ["Solange"] },
  { id: "t1", uri: "spotify:track:3A4FRzgve9BjfKbvVXRIFO", name: "Pink + White", subtitle: "Frank Ocean · Blonde", type: "track", artists: ["Frank Ocean"] },
  { id: "a2", uri: "spotify:artist:4kI8Ie27vjvonwaB2ePh8T", name: "SZA", subtitle: "Artist", type: "artist", artists: ["SZA"] }
];

export function PlaylistBuilder() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMix, setLoadingMix] = useState(false);
  const [playlistSize, setPlaylistSize] = useState(20);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [destination, setDestination] = useState<Destination>("spotify");
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [createdPlaylist, setCreatedPlaylist] = useState<CreatedPlaylist | null>(null);
  const [error, setError] = useState("");

  const isProviderConnected = (provider: Destination) => provider === "spotify" ? connected : youtubeConnected;
  const providerConnected = isProviderConnected(destination);
  const canGenerate = providerConnected && seeds.length > 0 && !loadingMix;
  const previewArtistCount = useMemo(() => new Set(tracks.map((track) => track.primaryArtist.toLocaleLowerCase())).size, [tracks]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("spotify") === "connected") setDestination("spotify");
    if (query.get("youtube") === "connected") {
      setDestination("youtube");
    }
    if (query.get("youtube") === "failed") {
      const reference = query.get("reference");
      setError(`YouTube authorization failed.${reference ? ` Reference: ${reference}.` : ""}`);
    }
    fetch("/api/auth/spotify/status").then((response) => response.json()).then((data: { connected: boolean }) => {
      setConnected(data.connected);
      if (query.get("spotify") === "connected" && !data.connected) setError("Spotify connected, but the session cookie was not saved. Restart the dev server and reconnect from 127.0.0.1.");
    }).catch(() => undefined);
    fetch("/api/auth/youtube/status").then((response) => response.json()).then((data: { connected: boolean }) => setYoutubeConnected(data.connected)).catch(() => undefined);
  }, []);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) return setResults([]);
    setLoadingSearch(true); setError("");
    try {
      const res = await fetch(`${providerSearchEndpoint(destination)}?q=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error((await res.json()).error || "Search failed");
      setResults((await res.json()).items);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t search Spotify."); }
    finally { setLoadingSearch(false); }
  }

  function addSeed(seed: Seed) {
    if (!seeds.some((item) => item.uri === seed.uri)) setSeeds((current) => [...current, seed]);
    setResults([]); setQuery("");
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setLoadingMix(true); setError(""); setCreatedPlaylist(null);
    try {
      const res = await fetch("/api/playlist/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seeds, size: playlistSize, provider: destination }) });
      const body = await res.json();
      if (!res.ok) {
        console.error("[Mood Mix] Playlist generation failed", body);
        const reference = body.requestId ? ` Reference: ${body.requestId}.` : "";
        throw new Error(`${body.error || "Couldn’t make your mix."}${reference}`);
      }
      setTracks(body.tracks);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t make your mix."); }
    finally { setLoadingMix(false); }
  }

  async function createPlaylist() {
    if (destination === "youtube" && !youtubeConnected) {
      window.location.href = "/api/auth/youtube";
      return;
    }
    setCreatingPlaylist(true); setError(""); setCreatedPlaylist(null);
    try {
      const name = "Mood Mix — Discoveries";
      const payload = { name, tracks: tracks.map(({ uri, name: trackName, artist }) => ({ uri, name: trackName, artist })) };
      const res = await fetch(providerPlaylistEndpoint(destination), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const playlist = await res.json();
      if (!res.ok) throw new Error(`${playlist.error || "Couldn’t create your playlist."}${playlist.requestId ? ` Reference: ${playlist.requestId}.` : ""}`);
      if (!playlist.url) throw new Error(`${providerName(destination)} created the playlist but did not return a link.`);
      setCreatedPlaylist({ url: playlist.url, provider: destination, skippedCount: playlist.skippedCount || 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t create your playlist.");
    } finally {
      setCreatingPlaylist(false);
    }
  }

  async function connectProvider(provider: Destination) {
    setError("");
    const statusEndpoints: Record<Destination, string> = { spotify: "/api/auth/spotify/status", youtube: "/api/auth/youtube/status" };
    try {
      const statusResponse = await fetch(statusEndpoints[provider]);
      const status = await statusResponse.json() as { configured?: boolean };
      if (!statusResponse.ok || !status.configured) {
        const variables = provider === "spotify" ? "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET" : "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET";
        setError(`${providerName(provider)} is not configured. Add ${variables} to .env.local and restart the dev server.`);
        return;
      }
    } catch {
      setError(`Couldn’t check the ${providerName(provider)} configuration.`);
      return;
    }
    window.location.href = provider === "spotify" ? "/api/auth/spotify" : "/api/auth/youtube";
  }

  function chooseProvider(provider: Destination) {
    setDestination(provider);
    setSeeds([]); setResults([]); setQuery(""); setTracks([]); setError(""); setCreatedPlaylist(null);
  }

  function chooseAndConnect(provider: Destination) {
    if (provider !== destination) chooseProvider(provider);
    void connectProvider(provider);
  }

  return <main>
    <nav><a className="brand" href="/">mood<span>mix</span></a><div className="nav-right"><span className="status"><i /> {providerConnected ? `${providerName(destination)} connected` : "Choose a music provider"}</span></div></nav>
    <section className="hero"><p className="eyebrow">DISCOVER SOMETHING NEW</p><h1>Choose your service.<br /><em>Find your next playlist.</em></h1><p className="intro">Connect a music provider, add a few songs, albums, or artists you love, and we’ll take you somewhere new.</p></section>
    <form className="workspace" onSubmit={generate}>
      <div className="step"><div className="step-number">01</div><div className="step-content"><p className="label">MUSIC PROVIDER</p><h2>Where do you listen?</h2><p className="help">Choose the service you want to search and create your playlist in.</p><ProviderButtons value={destination} connected={{ spotify: connected, youtube: youtubeConnected }} onSelect={chooseAndConnect} /></div></div>
      {providerConnected && <><div className="rule" /><div className="step"><div className="step-number">02</div><div className="step-content"><p className="label">YOUR STARTING POINT</p><h2>What’s been on repeat?</h2><p className="help">{destination === "youtube" ? "Choose 2–5 music videos or tracks from YouTube." : `Choose 2–5 songs, albums or artists from ${providerName(destination)}.`}</p>
        <div className="search-wrap"><span className="search-icon">⌕</span><input value={query} onChange={(event) => search(event.target.value)} placeholder={`Search ${providerName(destination)}`} aria-label={`Search ${providerName(destination)}`} />{loadingSearch && <span className="searching">Searching</span>}
          {results.length > 0 && <div className="results">{results.map((item) => <button type="button" className="result" onClick={() => addSeed(item)} key={item.uri}><span className="result-art">{item.image ? <img src={item.image} alt="" /> : item.type[0].toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.subtitle}</small></span><b>+</b></button>)}</div>}
        </div>
        {seeds.length === 0 ? <div className="empty-seeds"><button type="button" onClick={() => setSeeds(mockSeeds)}>Try an example mix</button></div> : <div className="chips">{seeds.map((seed) => <span className="chip" key={seed.uri}>{seed.name}<button type="button" aria-label={`Remove ${seed.name}`} onClick={() => setSeeds((items) => items.filter((item) => item.uri !== seed.uri))}>×</button></span>)}</div>}
      </div></div>
      <div className="generate-row"><LengthControl value={playlistSize} setValue={setPlaylistSize} /><div><span className="tiny">YOUR MIX WILL BE</span><strong>{playlistSize} tracks · at least {Math.ceil(playlistSize * 2 / 3)} new artists</strong></div><button className="generate" disabled={!canGenerate}>{loadingMix ? "Finding your sound…" : "Generate my mix"}<span>→</span></button></div></>}
    </form>
    {error && <p className="error">{error}</p>}
    {createdPlaylist && <div className="playlist-success" role="status"><div><strong>Playlist created in {providerName(createdPlaylist.provider)}</strong><span>{createdPlaylist.skippedCount ? `${createdPlaylist.skippedCount} tracks could not be matched.` : "Your discovery mix is ready."}</span></div><a href={createdPlaylist.url} target="_blank" rel="noopener noreferrer">Open playlist <span>↗</span></a></div>}
    {tracks.length > 0 && <section className="preview"><div><p className="eyebrow">YOUR DISCOVERY MIX</p><h2>{tracks.length} fresh discoveries</h2><p className="help">Featuring {previewArtistCount} new artists</p></div><button className="create" disabled={creatingPlaylist} onClick={createPlaylist}>{creatingPlaylist ? "Creating…" : `Create in ${providerName(destination)}`} <span>↗</span></button><ol>{tracks.map((track, index) => <li key={`${track.uri}:${index}`}><span className="index">{String(index + 1).padStart(2, "0")}</span>{track.image ? <img src={track.image} alt="" /> : <span className="cover" />}<span className="track"><b>{track.name}</b><small>{track.artist} · {track.album}</small></span><button type="button" className="remove" onClick={() => setTracks((items) => items.filter((item) => item.uri !== track.uri))}>Remove</button></li>)}</ol></section>}
    <footer>MOOD MIX <span>✦</span> DISCOVER WITH INTENTION</footer>
  </main>;
}

function LengthControl({ value, setValue }: { value: number; setValue: (value: number) => void }) {
  const sizes = [10, 15, 20, 25, 30, 35, 40, 45, 50];
  return <label className="length-control"><span>Playlist length</span><select value={value} onChange={(event) => setValue(Number(event.target.value))}>{sizes.map((size) => <option key={size} value={size}>{size} tracks</option>)}</select></label>;
}

function ProviderButtons({ value, connected, onSelect }: { value: Destination; connected: Record<Destination, boolean>; onSelect: (provider: Destination) => void }) {
  const providers = [
    { id: "spotify" as const, icon: <SiSpotify aria-hidden="true" /> },
    { id: "youtube" as const, icon: <SiYoutube aria-hidden="true" /> },
  ];
  return <div className="provider-buttons">{providers.map((provider) => <button type="button" className={`provider-button provider-${provider.id}${value === provider.id ? " selected" : ""}`} aria-pressed={value === provider.id} onClick={() => onSelect(provider.id)} key={provider.id}><span className="provider-logo">{provider.icon}</span><strong>{providerName(provider.id)}</strong>{connected[provider.id] && <b aria-label="Connected">✓</b>}</button>)}</div>;
}
