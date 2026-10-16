import { useId, type ReactNode } from 'react';

export function Pill({ active, onClick, children, title, small }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string; small?: boolean }) {
  return (
    <button type="button" className={`pill${active ? ' is-active' : ''}${small ? ' pill--small' : ''}`} aria-pressed={active} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <Pill key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden />
      <span className="toggle__text">
        {label}
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Section({ title, children, open, onToggle, badge }: { title: string; children: ReactNode; open: boolean; onToggle: () => void; badge?: string | number }) {
  return (
    <section className={`section${open ? ' is-open' : ''}`}>
      <button type="button" className="section__head" aria-expanded={open} onClick={onToggle}>
        <span>{title}</span>
        {badge ? <span className="badge">{badge}</span> : null}
        <span className="section__chev" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
      </button>
      {open && <div className="section__body">{children}</div>}
    </section>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__input">
        {prefix && <span className="field__affix">{prefix}</span>}
        <input
          id={id}
          className="input"
          type="number"
          inputMode="decimal"
          step={step}
          placeholder={placeholder ?? 'Any'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {suffix && <span className="field__affix">{suffix}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <span className="muted">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="currentColor" />
    </svg>
  );
}
