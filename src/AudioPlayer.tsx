import { useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Headphones, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

function timestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function usePlayback() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    setError(false);
    try { await element.play(); } catch { setError(true); }
  }
  function seek(value: number) {
    if (!audio.current || !duration) return;
    audio.current.currentTime = Math.max(0, Math.min(duration, value));
    setTime(audio.current.currentTime);
  }
  function metadata() {
    const length = audio.current?.duration;
    setDuration(length && Number.isFinite(length) ? length : 0);
  }
  return { audio, playing, setPlaying, time, setTime, duration, muted, setMuted, speed, setSpeed, error, setError, toggle, seek, metadata };
}
type Playback = ReturnType<typeof usePlayback>;
function PlaybackOptions({ player }: { player: Playback }) {
  return <div className="audio-options">
    <div className="audio-skip-controls">
      <button type="button" onClick={() => player.seek(player.time - 10)} disabled={!player.duration} aria-label="Back 10 seconds"><RotateCcw size={17} aria-hidden="true" /><span>10</span></button>
      <button type="button" onClick={() => player.seek(player.time + 10)} disabled={!player.duration} aria-label="Forward 10 seconds"><RotateCw size={17} aria-hidden="true" /><span>10</span></button>
    </div>
    <div className="audio-preferences">
      <select aria-label="Playback speed" value={player.speed} onChange={event => { if (player.audio.current) player.audio.current.playbackRate = Number(event.target.value); }}>
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
      </select>
      <button type="button" aria-label={player.muted ? "Unmute audio" : "Mute audio"} aria-pressed={player.muted} onClick={() => { if (player.audio.current) player.audio.current.muted = !player.audio.current.muted; }}>
        {player.muted ? <VolumeX size={19} aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}
export default function AudioPlayer({ src, title }: { src: string; title: string }) {
  const player = usePlayback();
  const progress = player.duration ? player.time / player.duration * 100 : 0;
  return <div className="audio-media audio-file" data-playing={player.playing} role="group" aria-label={title}>
    <audio ref={player.audio} src={src} preload="metadata" aria-label={title}
      onPlay={() => player.setPlaying(true)} onPause={() => player.setPlaying(false)} onEnded={() => player.setPlaying(false)}
      onTimeUpdate={event => player.setTime(event.currentTarget.currentTime)} onLoadedMetadata={player.metadata} onDurationChange={player.metadata}
      onVolumeChange={event => player.setMuted(event.currentTarget.muted)} onRateChange={event => player.setSpeed(event.currentTarget.playbackRate)}
      onError={() => player.setError(true)} onCanPlay={() => player.setError(false)} />
    <div className="audio-player-heading">
      <div className="audio-record" aria-hidden="true"><div className="audio-record-label"><Headphones size={23} /></div></div>
      <div className="audio-heading-copy"><span className="audio-eyebrow">Listen & read</span><span className="audio-title">{title}</span><span className="audio-subtitle">{player.playing ? "Now playing" : "A story in sound"}</span></div>
      <button className="audio-play" type="button" onClick={() => void player.toggle()} aria-label={player.playing ? "Pause audio" : "Play audio"}>
        {player.playing ? <Pause size={25} fill="currentColor" aria-hidden="true" /> : <Play size={25} fill="currentColor" aria-hidden="true" />}
      </button>
    </div>
    <div className="audio-timeline">
      <input type="range" min="0" max={player.duration || 1} step="0.1" value={player.time} disabled={!player.duration} onChange={event => player.seek(Number(event.target.value))} aria-label="Audio position" aria-valuetext={`${timestamp(player.time)} of ${timestamp(player.duration)}`} style={{ "--audio-progress": `${progress}%` } as CSSProperties} />
      <div className="audio-times"><span>{timestamp(player.time)}</span><span>{player.duration ? timestamp(player.duration) : "—:—"}</span></div>
    </div>
    <PlaybackOptions player={player} />
    {player.error && <p className="audio-error" role="alert">This audio could not be played. Try opening the audio link.</p>}
    <a className="audio-source" href={src} target="_blank" rel="noopener noreferrer">Open audio <ArrowUpRight size={12} aria-hidden="true" /></a>
  </div>;
}
