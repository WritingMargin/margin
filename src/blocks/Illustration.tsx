import { useId, useRef, useState } from "react";
import type { IllustrationSpec } from "./illustration-schema";
import "./illustration.css";
import {
  useIllustrationFlow,
  type FlowController,
} from "./useIllustrationFlow";
import {
  FlowControls,
  FlowDetail,
  FlowDrawing,
  FlowTranscript,
} from "./IllustrationFlow";

type ViewProps = {
  spec: IllustrationSpec;
  selected: number;
  select: (index: number) => void;
  flow: FlowController;
};

function IllustrationDrawing({ spec, selected, select, flow }: ViewProps) {
  const titleId = useId();
  const current = spec.regions[selected];
  const step = flow.active ? spec.flow?.steps[flow.position.step] : undefined;
  return (
    <svg
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      aria-labelledby={titleId}
      role="group"
    >
      <title id={titleId}>
        {`${spec.title}. Select a numbered region to learn more.`}
      </title>
      {spec.artwork && <image href={spec.artwork.src} width={spec.width} height={spec.height} aria-label={spec.artwork.alt} role="img" />}
      {spec.shapes.map((shape, index) => (
        <path
          key={index}
          aria-hidden="true"
          d={shape.path}
          fill={shape.fill}
          stroke={shape.stroke || shape.fill}
          strokeWidth={shape.strokeWidth}
          className={
            !!shape.region && shape.region === (step ? step.region : current.id)
              ? "illustration-selected"
              : undefined
          }
          onClick={
            shape.region
              ? () =>
                  select(
                    spec.regions.findIndex(
                      (region) => region.id === shape.region,
                    ),
                  )
              : undefined
          }
          style={{ cursor: shape.region ? "pointer" : undefined }}
        />
      ))}
      {step &&
        spec.flow?.landmarks.map((mark, index) => (
          <text
            key={index}
            x={mark.x}
            y={mark.y}
            textAnchor="middle"
            className="flow-landmark"
          >
            {mark.label}
          </text>
        ))}
      {step && <FlowDrawing step={step} progress={flow.position.progress} />}
      {!flow.active &&
        spec.regions.map((region, index) => (
          <g
            key={region.id}
            role="button"
            tabIndex={0}
            aria-label={`${index + 1}. ${region.label}`}
            aria-pressed={index === selected}
            className="illustration-marker"
            transform={`translate(${region.x},${region.y})`}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select(index);
              }
            }}
          >
            <circle
              r="19"
              fill={index === selected ? region.color : "#ffffff"}
              stroke={region.color}
              strokeWidth="2"
            />
            <text
              textAnchor="middle"
              dy="5"
              fill={index === selected ? "#ffffff" : "#302c2b"}
            >
              {index + 1}
            </text>
          </g>
        ))}
    </svg>
  );
}

function IllustrationView({ spec, selected, select, flow }: ViewProps) {
  const [zoom, setZoom] = useState(1);
  const current = spec.regions[selected];
  const detailId = useId();
  return (
    <>
      {spec.flow && (
        <div className="flow-mode block-toolbar">
          <button
            type="button"
            aria-pressed={!flow.active}
            onClick={flow.explore}
          >
            Explore anatomy
          </button>
          <button
            type="button"
            aria-pressed={flow.active}
            onClick={flow.follow}
          >
            Follow flow
          </button>
        </div>
      )}
      {spec.flow && flow.active && (
        <FlowControls spec={spec.flow} flow={flow} />
      )}
      <div className="block-toolbar">
        <span>
          {flow.active
            ? "Follow the moving dot and directional arrow"
            : "Click a number or choose a structure below"}
        </span>
        <div className="block-segments">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          >
            −
          </button>
          <span className="illustration-zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom === 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            +
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Reset view
          </button>
        </div>
      </div>
      <div className="illustration-layout">
        <div
          className="illustration-scroll"
          tabIndex={0}
          aria-label="Scrollable illustration"
          style={{ background: spec.background }}
        >
          <div
            className="illustration-canvas"
            style={{
              width: `${zoom * 100}%`,
              height: `calc(var(--illustration-height, var(--widget-height, 460px)) * ${zoom})`,
            }}
          >
            <IllustrationDrawing
              spec={spec}
              selected={selected}
              select={select}
              flow={flow}
            />
          </div>
        </div>
        <div
          className="illustration-detail"
          id={detailId}
          aria-live="polite"
          aria-atomic="true"
        >
          {spec.flow && flow.active ? (
            <FlowDetail spec={spec.flow} flow={flow} />
          ) : (
            <>
              <span className="illustration-index">
                STRUCTURE {String(selected + 1).padStart(2, "0")} /{" "}
                {String(spec.regions.length).padStart(2, "0")}
              </span>
              <h4>{current.label}</h4>
              <p>{current.description}</p>
              <div className="illustration-step">
                <button
                  type="button"
                  disabled={selected === 0}
                  onClick={() => select(selected - 1)}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={selected === spec.regions.length - 1}
                  onClick={() => select(selected + 1)}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {!flow.active && (
        <div className="illustration-regions" aria-label="Structures">
          {spec.regions.map((region, index) => (
            <button
              type="button"
              key={region.id}
              aria-pressed={selected === index}
              aria-controls={detailId}
              onClick={() => select(index)}
            >
              <span>{index + 1}</span>
              {region.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function Illustration({ spec }: { spec: IllustrationSpec }) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const flow = useIllustrationFlow(
    spec.flow,
    expanded ? dialog : host,
    expanded,
  );
  const select = (index: number) => {
    flow.explore();
    setSelected(index);
  };
  return (
    <div className="illustration" ref={host}>
      <div className="illustration-expand">
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            dialog.current?.showModal();
          }}
        >
          ⤢ Expand illustration
        </button>
      </div>
      <IllustrationView
        spec={spec}
        selected={selected}
        select={select}
        flow={flow}
      />
      {spec.flow && <FlowTranscript spec={spec.flow} />}
      <details className="illustration-transcript">
        <summary>Read all structure descriptions</summary>
        <dl>
          {spec.regions.map((region) => (
            <div key={region.id}>
              <dt>{region.label}</dt>
              <dd>{region.description}</dd>
            </div>
          ))}
        </dl>
      </details>
      <dialog
        ref={dialog}
        onClose={() => setExpanded(false)}
        className="illustration-dialog"
        aria-labelledby={headingId}
      >
        <div className="illustration-dialog-heading">
          <h3 id={headingId}>{spec.title}</h3>
          {spec.flow && flow.active && (
            <button
              type="button"
              aria-label={
                flow.playing ? "Pause expanded flow" : "Play expanded flow"
              }
              disabled={flow.reducedMotion}
              onClick={flow.toggle}
            >
              {flow.playing ? "Pause flow" : "Play flow"}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Close expanded view ×
          </button>
        </div>
        <IllustrationView
          spec={spec}
          selected={selected}
          select={select}
          flow={flow}
        />
      </dialog>
    </div>
  );
}
