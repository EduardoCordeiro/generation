"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Seed = { id: string; uri: string; name: string; subtitle: string; type: "artist" | "album" | "track"; image?: string };
type Result = Seed;
type PlaylistTrack = { uri: string; name: string; artist: string; album: string; image?: string };

const mockSeeds: Seed[] = [
  { id: "a1", uri: "spotify:artist:5K4W6rqBFWDnAN6FQUkS6x", name: "Solange", subtitle: "Artist", type: "artist" },
  { id: "t1", uri: "spotify:track:3A4FRzgve9BjfKbvVXRIFO", name: "Pink + White", subtitle: "Frank Ocean · Blonde", type: "track" },
  { id: "a2", uri: "spotify:artist:4kI8Ie27vjvonwaB2ePh8T", name: "SZA", subtitle: "Artist", type: "artist" }
];

export function PlaylistBuilder() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMix, setLoadingMix] = useState(false);
  const [brief, setBrief] = useState("");
  const [energy, setEnergy] = useState(52);
  const [warmth, setWarmth] = useState(65);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [error, setError] = useState("");

  const canGenerate = seeds.length > 0 && !loadingMix;
  const mood = useMemo(() => brief || "soft, soulful and warm", [brief]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    fetch("/api/auth/spotify/status").then((response) => response.json()).then((data: { connected: boolean }) => {
      setConnected(data.connected);
      if (query.get("spotify") === "connected" && !data.connected) setError("Spotify connected, but the session cookie was not saved. Restart the dev server and reconnect from 127.0.0.1.");
    }).catch(() => undefined);
  }, []);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) return setResults([]);
    setLoadingSearch(true); setError("");
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(value)}`);
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
    setLoadingMix(true); setError("");
    try {
      const res = await fetch("/api/playlist/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seeds, brief, energy, warmth }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn’t make your mix.");
      setTracks(body.tracks);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t make your mix."); }
    finally { setLoadingMix(false); }
  }

  async function createPlaylist() {
    const name = `Mood Mix — ${mood}`;
    const res = await fetch("/api/spotify/playlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, uris: tracks.map((track) => track.uri) }) });
    if (!res.ok) return setError((await res.json()).error || "Couldn’t create your playlist.");
    const playlist = await res.json(); window.open(playlist.url, "_blank", "noopener,noreferrer");
  }

  return <main>
    <nav><a className="brand" href="/">mood<span>mix</span></a><div className="nav-right"><span className="status"><i /> {connected ? "Spotify connected" : "Spotify not connected"}</span><a className="connect" href="/api/auth/spotify">Connect Spotify</a></div></nav>
    <section className="hero"><p className="eyebrow">DISCOVER SOMETHING NEW</p><h1>Start with a feeling.<br /><em>End with a playlist.</em></h1><p className="intro">Add a few songs, albums, or artists you love. We’ll find the thread that ties them together—and take you somewhere new.</p></section>
    <form className="workspace" onSubmit={generate}>
      <div className="step"><div className="step-number">01</div><div className="step-content"><p className="label">YOUR STARTING POINT</p><h2>What’s been on repeat?</h2><p className="help">Choose 2–5 songs, albums or artists from Spotify.</p>
        <div className="search-wrap"><span className="search-icon">⌕</span><input value={query} onChange={(event) => search(event.target.value)} placeholder="Search Spotify" aria-label="Search Spotify" />{loadingSearch && <span className="searching">Searching</span>}
          {results.length > 0 && <div className="results">{results.map((item) => <button type="button" className="result" onClick={() => addSeed(item)} key={item.uri}><span className="result-art">{item.image ? <img src={item.image} alt="" /> : item.type[0].toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.subtitle}</small></span><b>+</b></button>)}</div>}
        </div>
        {seeds.length === 0 ? <div className="empty-seeds"><button type="button" onClick={() => setSeeds(mockSeeds)}>Try an example mix</button></div> : <div className="chips">{seeds.map((seed) => <span className="chip" key={seed.uri}>{seed.name}<button type="button" aria-label={`Remove ${seed.name}`} onClick={() => setSeeds((items) => items.filter((item) => item.uri !== seed.uri))}>×</button></span>)}</div>}
      </div></div>
      <div className="rule" />
      <div className="step"><div className="step-number">02</div><div className="step-content"><p className="label">SET THE DIRECTION <span>OPTIONAL</span></p><h2>Fine-tune the mood.</h2><div className="mood-grid"><label className="brief"><span>In your own words</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="e.g. a slow Sunday morning by the sea" maxLength={120} /></label><div className="sliders"><Range label="Energy" low="Unhurried" high="Electric" value={energy} setValue={setEnergy} /><Range label="Warmth" low="Cool" high="Golden" value={warmth} setValue={setWarmth} /></div></div></div></div>
      <div className="generate-row"><div><span className="tiny">YOUR MIX WILL BE</span><strong>20 tracks · all new to you</strong></div><button className="generate" disabled={!canGenerate}>{loadingMix ? "Finding your sound…" : "Generate my mix"}<span>→</span></button></div>
    </form>
    {error && <p className="error">{error}</p>}
    {tracks.length > 0 && <section className="preview"><div><p className="eyebrow">YOUR DISCOVERY MIX</p><h2>20 tracks for <em>{mood}</em></h2></div><button className="create" onClick={createPlaylist}>Create in Spotify <span>↗</span></button><ol>{tracks.map((track, index) => <li key={track.uri}><span className="index">{String(index + 1).padStart(2, "0")}</span>{track.image ? <img src={track.image} alt="" /> : <span className="cover" />}<span className="track"><b>{track.name}</b><small>{track.artist} · {track.album}</small></span><button type="button" className="remove" onClick={() => setTracks((items) => items.filter((item) => item.uri !== track.uri))}>Remove</button></li>)}</ol></section>}
    <footer>MOOD MIX <span>✦</span> DISCOVER WITH INTENTION</footer>
  </main>;
}

function Range({ label, low, high, value, setValue }: { label: string; low: string; high: string; value: number; setValue: (value: number) => void }) {
  return <label className="range"><span>{label}</span><input type="range" min="0" max="100" value={value} onChange={(event) => setValue(Number(event.target.value))} style={{ "--value": `${value}%` } as React.CSSProperties} /><small><i>{low}</i><i>{high}</i></small></label>;
}
