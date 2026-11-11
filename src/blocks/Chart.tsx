import ChartDataTable from "./ChartDataTable";
import ChartPlot from "./ChartPlot";
import { format,palette } from "./chart-format";

import { useChart } from "./useChart";
export default function Chart(props: Parameters<typeof useChart>[0]) {
  const state = useChart(props);
  const { spec, type, setType, hidden, setHidden, active, visible } = state;
  return (
    <>
      <div className="block-toolbar">
        <div className="block-segments" aria-label="Chart style">
          {(["line", "bar", "area"] as const).map((t) => (
            <button
              key={t}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span>{spec.yLabel || "Value"}</span>
      </div>
      <ChartPlot state={state} />
      <div className="chart-readout">
        {active === null
          ? "Hover or tap the chart to inspect values."
          : `${spec.labels[active]} · ${visible.map((s) => `${s.name}: ${format(s.values[active])}`).join(" · ")}`}
      </div>
      <div className="block-legend">
        {spec.series.map((s, i) => (
          <button
            key={s.name}
            aria-pressed={!hidden.includes(s.name)}
            disabled={visible.length === 1 && !hidden.includes(s.name)}
            onClick={() =>
              setHidden((h) =>
                h.includes(s.name)
                  ? h.filter((n) => n !== s.name)
                  : [...h, s.name],
              )
            }
          >
            <i style={{ background: s.color || palette[i] }} />
            {s.name}
          </button>
        ))}
      </div>
      <ChartDataTable state={state} />
    </>
  );
}
