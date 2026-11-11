import { format } from "./chart-format";
import type { ChartController } from "./useChart";
type Props = {
  state: Pick<
    ChartController,
    | "spec"
    | "id"
    | "type"
    | "active"
    | "setActive"
    | "visible"
    | "min"
    | "span"
    | "bottom"
    | "top"
    | "left"
    | "width"
    | "x"
    | "y"
    | "groupWidth"
  >;
};
export default function ChartPlot({ state }: Props) {
  const {
    spec,
    id,
    type,
    active,
    setActive,
    visible,
    min,
    span,
    bottom,
    top,
    left,
    width,
    x,
    y,
    groupWidth,
  } = state;
  return (
    <svg
      className="block-chart"
      viewBox="0 0 640 320"
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
    >
      <title id={`${id}-title`}>{spec.title}</title>
      <desc id={`${id}-desc`}>
        {spec.description || "Interactive chart."} Exact values are available in
        the data table below.
      </desc>
      {Array.from({ length: 5 }, (_, i) => min + (span * i) / 4).map((v, i) => (
        <g key={i}>
          <line x1={left} x2={620} y1={y(v)} y2={y(v)} stroke="#e3e7df" />
          <text x={left - 10} y={y(v) + 4} textAnchor="end">
            {format(v)}
          </text>
        </g>
      ))}
      <line x1={left} x2={620} y1={y(0)} y2={y(0)} stroke="#b8c1b5" />
      {spec.labels.map(
        (label, i) =>
          (i % Math.max(1, Math.ceil(spec.labels.length / 8)) === 0 ||
            i === spec.labels.length - 1) && (
            <text key={i} x={x(i)} y={285} textAnchor="middle">
              {label.length > 12 ? label.slice(0, 10) + "…" : label}
            </text>
          ),
      )}
      {spec.xLabel && (
        <text x={340} y={311} textAnchor="middle">
          {spec.xLabel}
        </text>
      )}
      {visible.map((s, si) => (
        <g key={s.name}>
          {type === "area" && (
            <path
              d={`M ${x(0)} ${y(0)} ${s.values.map((v, i) => `L ${x(i)} ${y(v)}`).join(" ")} L ${x(s.values.length - 1)} ${y(0)} Z`}
              fill={s.color}
              opacity={0.12}
            />
          )}
          {type !== "bar" && (
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
            />
          )}
          {s.values.map((v, i) =>
            type === "bar" ? (
              <rect
                key={i}
                x={x(i) - groupWidth / 2 + (si * groupWidth) / visible.length}
                y={Math.min(y(v), y(0))}
                width={Math.max(0.5, groupWidth / visible.length - 2)}
                height={Math.max(1, Math.abs(y(v) - y(0)))}
                fill={s.color}
              >
                <title>{`${s.name}, ${spec.labels[i]}: ${v}`}</title>
              </rect>
            ) : (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={active === i ? 5 : 3}
                fill={s.color}
              >
                <title>{`${s.name}, ${spec.labels[i]}: ${v}`}</title>
              </circle>
            ),
          )}
        </g>
      ))}
      {spec.labels.map((label, i) => (
        <rect
          key={i}
          x={left + (width * i) / spec.labels.length}
          y={top}
          width={width / spec.labels.length}
          height={bottom - top}
          fill="transparent"
          onMouseEnter={() => setActive(i)}
          onMouseLeave={() => setActive(null)}
          onClick={() => setActive(i)}
        >
          <title>
            {label +
              ": " +
              visible.map((s) => `${s.name} ${s.values[i]}`).join(", ")}
          </title>
        </rect>
      ))}
    </svg>
  );
}
