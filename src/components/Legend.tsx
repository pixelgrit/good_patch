import type { MapValues } from '../hooks/useDerived';
import { NO_DATA, rampGradientCss } from '../lib/colors';
import { useStore } from '../store';

export function Legend({ values, shown, total }: { values: MapValues; shown: number; total: number }) {
  const layers = useStore((s) => s.layers);
  return (
    <div className="legend" aria-label="Map legend">
      <div className="legend__title">{values.title}</div>
      <div className="legend__note muted">{values.note}</div>
      <div className="legend__ramp" style={{ background: rampGradientCss() }} />
      <div className="legend__ticks">
        {values.ticks.map((t) => (
          <span key={t.at} style={{ left: `${t.at * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="legend__ends muted">
        <span>{values.lowLabel}</span>
        <span>{values.highLabel}</span>
      </div>
      <div className="legend__keys">
        <span className="legend__key">
          <i style={{ background: NO_DATA }} /> Not enough data
        </span>
        {layers.tram && (
          <span className="legend__key">
            <i className="legend__line" /> Tram
          </span>
        )}
        {layers.tram && layers.tramCatchment && (
          <span className="legend__key">
            <i className="legend__hatch" /> 800 m of a stop
          </span>
        )}
        {layers.train && (
          <span className="legend__key">
            <i className="legend__line legend__line--dash" /> Train
          </span>
        )}
      </div>
      {shown < total && (
        <div className="legend__count muted">
          {shown} of {total} suburbs match filters
        </div>
      )}
    </div>
  );
}
