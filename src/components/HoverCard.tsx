import { useSuburbByCode } from '../hooks/useDerived';
import { formatMetric, formatScore, formatValue } from '../lib/format';
import { METRIC_BY_KEY } from '../lib/metrics';
import { getValue, type SuburbScore } from '../lib/scoring';
import { TYPE_LABEL, TYPE_SINGULAR } from '../lib/types';
import { useStore } from '../store';

interface Props {
  code: string;
  x: number;
  y: number;
  scores: Map<string, SuburbScore>;
}

/** A one-word read on the overall score. */
function verdict(score: number): string {
  if (score >= 65) return 'Strong signals';
  if (score >= 45) return 'Mixed signals';
  return 'Weak signals';
}

export function HoverCard({ code, x, y, scores }: Props) {
  const byCode = useSuburbByCode();
  const view = useStore((s) => s.view);
  const type = useStore((s) => s.type);
  const s = byCode.get(code);
  const sc = scores.get(code);
  if (!s || !sc) return null;
  const viewDef = view !== 'score' ? METRIC_BY_KEY[view] : null;
  const price = getValue(s, type, 'medianPrice');
  const yld = type === 'land' ? null : getValue(s, type, 'grossYield');

  const left = Math.min(x + 16, window.innerWidth - 280);
  const top = Math.max(12, y - 20);

  return (
    <div className="hover-card" style={{ left, top }} role="tooltip">
      <div className="hover-card__name">
        {s.name} {TYPE_LABEL[type].toLowerCase()}
      </div>
      {viewDef && (
        <div className="hover-card__metric">
          {viewDef.label}: <strong>{formatMetric(viewDef, getValue(s, type, view))}</strong>
        </div>
      )}
      <div className="hover-card__metric">
        {sc.unpriced ? `No recent ${TYPE_SINGULAR[type]} sales` : sc.insufficient || sc.score == null ? 'Not enough data to score' : `Overall ${formatScore(sc.score)} · ${verdict(sc.score)}`}
      </div>
      {price != null && (
        <div className="hover-card__metric">
          Typical {formatValue('aud', price, { compact: true })}
          {yld != null && ` · yield ${formatValue('pct', yld)}`}
        </div>
      )}
    </div>
  );
}
