import { useSuburbByCode } from '../hooks/useDerived';
import { formatMetric, formatScore } from '../lib/format';
import { topFactors, type SuburbScore } from '../lib/scoring';
import { useStore } from '../store';
import { METRIC_BY_KEY } from '../lib/metrics';
import { getValue } from '../lib/scoring';

interface Props {
  code: string;
  x: number;
  y: number;
  scores: Map<string, SuburbScore>;
}

export function HoverCard({ code, x, y, scores }: Props) {
  const byCode = useSuburbByCode();
  const view = useStore((s) => s.view);
  const type = useStore((s) => s.type);
  const s = byCode.get(code);
  const sc = scores.get(code);
  if (!s || !sc) return null;
  const { strong, weak } = topFactors(sc);
  const viewDef = view !== 'score' ? METRIC_BY_KEY[view] : null;

  const left = Math.min(x + 16, window.innerWidth - 280);
  const top = Math.max(12, y - 20);

  return (
    <div className="hover-card" style={{ left, top }} role="tooltip">
      <div className="hover-card__head">
        <span className="hover-card__name">{s.name}</span>
        <span className="hover-card__score">{sc.unpriced ? `No ${type === 'houses' ? 'house' : 'unit'} sales` : sc.insufficient ? 'Not enough data' : formatScore(sc.score)}</span>
      </div>
      {viewDef && (
        <div className="hover-card__metric">
          {viewDef.label}: <strong>{formatMetric(viewDef, getValue(s, type, view))}</strong>
        </div>
      )}
      {!sc.insufficient && (
        <dl className="hover-card__factors">
          <dt>Strongest</dt>
          {strong.map((m) => (
            <dd key={m.key}>
              {m.def.short} <span>{formatMetric(m.def, m.value, true)}</span>
            </dd>
          ))}
          <dt>Weakest</dt>
          {weak.map((m) => (
            <dd key={m.key}>
              {m.def.short} <span>{formatMetric(m.def, m.value, true)}</span>
            </dd>
          ))}
        </dl>
      )}
    </div>
  );
}
