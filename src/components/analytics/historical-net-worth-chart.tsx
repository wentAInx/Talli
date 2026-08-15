import type { HistoricalNetWorthPoint } from "@/domain/historical-quote-types";

const WIDTH = 920;
const HEIGHT = 300;
const PADDING_X = 34;
const PADDING_Y = 24;

function geometryValue(point: HistoricalNetWorthPoint): number | null {
  if (point.completeValueText === null) return null;
  const value = Number(point.completeValueText);
  return Number.isFinite(value) ? value : null;
}

export function HistoricalNetWorthChart({
  points,
  homeCode,
}: {
  points: readonly HistoricalNetWorthPoint[];
  homeCode: string;
}) {
  const values = points.map(geometryValue);
  const finite = values.filter((value): value is number => value !== null);
  const minimum = finite.length > 0 ? Math.min(...finite) : 0;
  const maximum = finite.length > 0 ? Math.max(...finite) : 0;
  const span = maximum === minimum ? 1 : maximum - minimum;
  const x = (index: number) =>
    PADDING_X +
    (points.length <= 1
      ? (WIDTH - 2 * PADDING_X) / 2
      : (index / (points.length - 1)) * (WIDTH - 2 * PADDING_X));
  const y = (value: number) =>
    HEIGHT - PADDING_Y - ((value - minimum) / span) * (HEIGHT - 2 * PADDING_Y);
  const segments: string[][] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push(`${x(index)},${y(value)}`);
  });
  if (current.length > 0) segments.push(current);

  return (
    <div className="analytics-chart-wrap">
      <svg
        aria-labelledby="historical-net-worth-title historical-net-worth-desc"
        className="analytics-chart"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title id="historical-net-worth-title">历史净值曲线</title>
        <desc id="historical-net-worth-desc">
          完整估值点使用实线连接；报价缺失的日期保留断点，不按零处理。
        </desc>
        <line
          className="analytics-chart-axis"
          x1={PADDING_X}
          x2={WIDTH - PADDING_X}
          y1={HEIGHT - PADDING_Y}
          y2={HEIGHT - PADDING_Y}
        />
        {segments.map((segment, index) => (
          <polyline
            className="analytics-chart-line"
            fill="none"
            key={`${segment[0]}-${index}`}
            points={segment.join(" ")}
          />
        ))}
        {points.map((point, index) => {
          const value = values[index];
          if (value === null) {
            return (
              <g key={point.localDate}>
                <line
                  className="analytics-chart-gap"
                  x1={x(index)}
                  x2={x(index)}
                  y1={PADDING_Y}
                  y2={HEIGHT - PADDING_Y}
                />
                <title>{`${point.localDate}：估值不完整，缺少 ${point.missingAssetIds.length} 项报价`}</title>
              </g>
            );
          }
          return (
            <circle
              className={
                point.isDegraded
                  ? "analytics-chart-point is-degraded"
                  : "analytics-chart-point"
              }
              cx={x(index)}
              cy={y(value)}
              key={point.localDate}
              r={point.isDegraded ? 4.5 : 3.5}
              tabIndex={0}
            >
              <title>{`${point.localDate}：${point.completeValueText} ${homeCode}${
                point.isDegraded ? "（使用回退报价）" : ""
              }`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="analytics-chart-range" aria-hidden="true">
        <span>{points[0]?.localDate ?? "—"}</span>
        <span>{points.at(-1)?.localDate ?? "—"}</span>
      </div>
      <details className="analytics-data-table">
        <summary>查看精确每日数据</summary>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">完整净值</th>
                <th scope="col">已知小计</th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.localDate}>
                  <th scope="row">{point.localDate}</th>
                  <td>
                    {point.completeValueText === null
                      ? "—"
                      : `${point.completeValueText} ${homeCode}`}
                  </td>
                  <td>{`${point.knownValueText} ${homeCode}`}</td>
                  <td>
                    {point.isComplete
                      ? point.isDegraded
                        ? "完整 · 回退报价"
                        : "完整"
                      : `缺 ${point.missingAssetIds.length} 项报价`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
