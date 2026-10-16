import { useMemo, useState } from 'react';
import { useSuburbs } from '../hooks/useDerived';
import { useStore } from '../store';

export function Search() {
  const suburbs = useSuburbs();
  const select = useStore((s) => s.select);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return suburbs
      .filter((s) => s.name.toLowerCase().includes(term) || s.postcode.startsWith(term))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [q, suburbs]);

  const choose = (code: string) => {
    select(code, true);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="search">
      <label className="visually-hidden" htmlFor="suburb-search">
        Search by suburb or postcode
      </label>
      <input
        id="suburb-search"
        className="input"
        type="search"
        placeholder="Search suburb or postcode"
        autoComplete="off"
        value={q}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="suburb-search-results"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active]) {
            choose(results[active].code);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="search__results" id="suburb-search-results" role="listbox">
          {results.map((s, i) => (
            <li
              key={s.code}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s.code);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{s.name}</span>
              <span className="muted">{s.postcode}</span>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim() && results.length === 0 && <div className="search__empty muted">No suburbs match</div>}
    </div>
  );
}
