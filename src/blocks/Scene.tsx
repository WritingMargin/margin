import { useScene } from "./useScene";
export default function Scene(props: Parameters<typeof useScene>[0]) {
  const state = useScene(props);
  const {
    spec,
    pulsing,
    motionReduced,
    host,
    actions,
    error,
    rotating,
    setRotating,
    wireframe,
    setWireframe,
    selected,
    setSelected,
  } = state;
  return (
    <>
      <div className="block-toolbar">
        <div className="block-segments">
          {spec.objects.some((object) => object.pulse) && (
            <button
              disabled={!!error || motionReduced}
              aria-pressed={pulsing}
              onClick={() => actions.current?.pulse(!pulsing)}
            >
              {pulsing ? "Pause heartbeat" : "Play heartbeat"}
            </button>
          )}
          <button
            disabled={!!error}
            aria-pressed={rotating}
            onClick={() => {
              setRotating(!rotating);
              actions.current?.rotate(!rotating);
            }}
          >
            Auto-rotate
          </button>
          <button
            disabled={!!error}
            aria-pressed={wireframe}
            onClick={() => {
              setWireframe(!wireframe);
              actions.current?.wireframe(!wireframe);
            }}
          >
            Wireframe
          </button>
          <button disabled={!!error} onClick={() => actions.current?.reset()}>
            Reset view
          </button>
        </div>
      </div>
      <ClipControls state={state} />
      <SceneStatus state={state} />
      <div className="block-scene" ref={host} hidden={!!error} />
      {(error || state.modelError) && spec.poster && (
        <figure>
          <img src={spec.poster.src} alt={spec.poster.alt} />
          <figcaption>{spec.poster.alt}</figcaption>
        </figure>
      )}
      <p className="block-hint">
        Drag to orbit · Scroll to zoom · Arrow keys to orbit · + / − to zoom
      </p>
      <div className="block-legend">
        {spec.objects.map((object, i) => (
          <button
            key={i}
            aria-pressed={selected === i}
            onClick={() => {
              setSelected(i);
              actions.current?.select(i);
            }}
          >
            <i style={{ background: object.color }} />
            {object.label}
          </button>
        ))}
      </div>
      {selected !== null && (
        <div className="scene-selection" role="status">
          <strong>{spec.objects[selected].label}</strong>
          {spec.objects[selected].description && (
            <p>{spec.objects[selected].description}</p>
          )}
        </div>
      )}
    </>
  );
}

function ClipControls({ state }: { state: ReturnType<typeof useScene> }) {
  const { error, actions } = state;
  if (!state.clips.length) return null;
  return (
    <div className="block-toolbar">
      <label>
        Animation clip{" "}
        <select
          value={state.clipId}
          disabled={!!error}
          onChange={(event) => actions.current?.selectClip(event.target.value)}
        >
          {state.clips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.label}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!!error}
        onClick={() => actions.current?.playClip(!state.playing)}
      >
        {state.playing ? "Pause animation" : "Play animation"}
      </button>
    </div>
  );
}

function SceneStatus({ state }: { state: ReturnType<typeof useScene> }) {
  const {
    spec,
    motionReduced,
    loading,
    modelError,
    error,
    pulsing,
    pulsePhase,
  } = state;
  return (
    <>
      {motionReduced && spec.objects.some((object) => object.pulse) && (
        <p className="block-hint">
          Heartbeat motion is paused because reduced motion is enabled.
        </p>
      )}
      {loading > 0 && (
        <p className="block-hint" role="status">
          Loading 3D model…
        </p>
      )}
      {modelError && (
        <p className="block-error" role="status">
          {modelError}
        </p>
      )}
      {error && (
        <p className="block-error" role="status">
          {error}
        </p>
      )}
      {spec.objects.some((object) => object.pulse) && (
        <p className="block-hint scene-pulse-phase">
          Illustrative heartbeat · {pulsing ? pulsePhase : "Paused"}
        </p>
      )}
    </>
  );
}
