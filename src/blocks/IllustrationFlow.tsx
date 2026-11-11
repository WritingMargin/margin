import Select from "../components/Select";
import { useId } from "react";
import type {
  IllustrationFlowSpec,
  FlowStep,
} from "./illustration-flow-schema";
import type { FlowController } from "./useIllustrationFlow";
import { flowColor, pointAlongRoute } from "./illustration-flow";

export function FlowDrawing({
  step,
  progress,
}: {
  step: FlowStep;
  progress: number;
}) {
  const arrow = useId();
  const [x, y] = pointAlongRoute(step.points, progress);
  const color = flowColor(step.color, step.endColor ?? step.color, progress);
  const points = step.points.map((point) => point.join(",")).join(" ");
  return (
    <g className="illustration-flow-drawing" aria-hidden="true">
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 Z" fill={step.endColor ?? step.color} />
        </marker>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke={step.color}
        strokeWidth="4"
        strokeDasharray="6 5"
        strokeLinejoin="round"
        markerEnd={`url(#${arrow})`}
      />
      <circle
        cx={x}
        cy={y}
        r="14"
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <circle className="flow-particle" cx={x} cy={y} r="9" fill={color} />
    </g>
  );
}
export function FlowControls({
  spec,
  flow,
}: {
  spec: IllustrationFlowSpec;
  flow: FlowController;
}) {
  return (
    <div className="illustration-flow-controls">
      <div className="block-toolbar">
        <strong>{spec.title}</strong>
        <div className="block-segments">
          <button
            type="button"
            disabled={flow.reducedMotion}
            onClick={flow.toggle}
          >
            {flow.complete
              ? "Replay flow"
              : flow.playing
                ? "Pause flow"
                : "Play flow"}
          </button>
          <button type="button" onClick={() => flow.seek(0)}>
            Restart flow
          </button>
          <label>
            Speed{" "}
            <Select
              aria-label="Flow speed"
              value={flow.speed}
              onChange={(event) => flow.setSpeed(Number(event.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </Select>
          </label>
        </div>
      </div>
      <p className="flow-note">{spec.description}</p>
      {flow.reducedMotion && (
        <p className="flow-note">
          Reduced motion is enabled. Use the step buttons to follow the route
          without animation.
        </p>
      )}
      <div className="flow-steps" aria-label="Flow stages">
        {spec.steps.map((step, index) => (
          <button
            type="button"
            key={index}
            aria-pressed={flow.position.step === index}
            onClick={() => flow.seek(index)}
          >
            {index + 1}. {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function FlowDetail({
  spec,
  flow,
}: {
  spec: IllustrationFlowSpec;
  flow: FlowController;
}) {
  const step = spec.steps[flow.position.step];
  return (
    <>
      <span className="illustration-index">
        JOURNEY {flow.position.step + 1} / {spec.steps.length}
        {flow.complete ? " · COMPLETE" : ""}
      </span>
      <h4>{step.label}</h4>
      <p>{step.description}</p>
      <div className="illustration-step">
        <button
          type="button"
          disabled={flow.position.step === 0}
          onClick={() => flow.seek(flow.position.step - 1)}
        >
          ← Previous stage
        </button>
        <button
          type="button"
          disabled={flow.position.step === spec.steps.length - 1}
          onClick={() => flow.seek(flow.position.step + 1)}
        >
          Next stage →
        </button>
      </div>
    </>
  );
}
export function FlowTranscript({ spec }: { spec: IllustrationFlowSpec }) {
  return (
    <details className="illustration-transcript">
      <summary>Read the complete flow journey</summary>
      <p>{spec.description}</p>
      <ol>
        {spec.steps.map((step, index) => (
          <li key={index}>
            <strong>{step.label}</strong>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
