import type { SettingDef, SettingValue } from '../../visualizations/types';

// Один контрол по описанию настройки. Экран не знает, какой это стиль:
// он просто перебирает описания из реестра и рисует для каждого свой контрол.
export function SettingControl({ def, value, onChange }: {
  def: SettingDef;
  value: SettingValue;
  onChange: (v: SettingValue) => void;
}) {
  // switch по `kind` — после него TypeScript знает поля конкретного варианта (≈ pattern matching).
  switch (def.kind) {
    case 'choice': {
      const current = def.options.find((o) => o.id === value);
      return (
        <div className="setting">
          <div className="setting-title">{def.title}</div>
          <div className="chips">
            {def.options.map((o) => (
              <button key={o.id} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.title}</button>
            ))}
          </div>
          {(current?.hint ?? def.hint) && <div className="setting-hint">{current?.hint ?? def.hint}</div>}
        </div>
      );
    }
    case 'range':
      return (
        <div className="setting">
          <div className="setting-title">
            {def.title}
            <span className="setting-value">{value}{def.unit ? ` ${def.unit}` : ''}</span>
          </div>
          <input
            className="slider"
            type="range"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          {def.hint && <div className="setting-hint">{def.hint}</div>}
        </div>
      );
    case 'toggle':
      return (
        <label className="setting setting-toggle">
          <span className="setting-title">{def.title}</span>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {def.hint && <div className="setting-hint">{def.hint}</div>}
        </label>
      );
  }
}
