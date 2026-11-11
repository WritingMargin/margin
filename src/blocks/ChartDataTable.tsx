import type { ChartController } from "./useChart";
type Props = { state: Pick<ChartController, "spec"> };
export default function ChartDataTable({ state }: Props) {
  const { spec } = state;
  return (
    <details className="block-data">
      <summary>View data table</summary>
      <div className="md-table-wrap">
        <table>
          <caption>
            {spec.title}
            {spec.yLabel ? ` — ${spec.yLabel}` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">{spec.xLabel || "Label"}</th>
              {spec.series.map((s) => (
                <th scope="col" key={s.name}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.labels.map((label, i) => (
              <tr key={i}>
                <th scope="row">{label}</th>
                {spec.series.map((s) => (
                  <td key={s.name}>{s.values[i]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
