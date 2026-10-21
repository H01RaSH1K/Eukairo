import type { Param } from '../../db/schema';
import { newId } from '../../db/commands';
import { parseOptions } from '../../domain/points';

// Черновик параметра: у варианта список правится одной строкой «пальцы, кулаки, ладони».
export type DraftParam = Param & { optText?: string };

export const toDraft = (params: Param[] = []): DraftParam[] =>
  params.map((p) => (p.options ? { ...p, optText: p.options.map((o) => o.name).join(', ') } : p));

/** Черновик → параметры: пустые выбрасываем, строку вариантов разбираем (id старых вариантов сохраняются). */
export function fromDraft(draft: DraftParam[]): Param[] {
  return draft.filter((p) => p.name.trim()).flatMap((p): Param[] => {
    if (!p.options) return [{ id: p.id, name: p.name.trim(), unit: p.unit?.trim() || undefined }];
    const options = parseOptions(p.optText ?? '', p.options, newId);
    return options.length ? [{ id: p.id, name: p.name.trim(), options }] : []; // вариант без вариантов не нужен
  });
}

// Список параметров занятия: числа («Отжимания, раз») и варианты («Хват: пальцы, кулаки, ладони»).
export function ParamsEditor({ value, onChange }: { value: DraftParam[]; onChange: (v: DraftParam[]) => void }) {
  const set = (i: number, patch: Partial<DraftParam>) => onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <>
      {value.map((p, i) => (
        <div key={p.id} className="param-edit">
          <div className="field-row param-row">
            <input className="field" value={p.name} placeholder={p.options ? 'Например, хват' : 'Например, отжимания'}
              onChange={(e) => set(i, { name: e.target.value })} />
            {!p.options && <input className="field unit-input" value={p.unit ?? ''} placeholder="раз" onChange={(e) => set(i, { unit: e.target.value })} />}
            <button className="btn small" aria-label="Убрать параметр" onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button>
          </div>
          {p.options && (
            <label className="field options-field">
              <span className="dim small">варианты</span>
              <input value={p.optText ?? ''} placeholder="пальцы, кулаки, ладони" aria-label="Варианты через запятую"
                onChange={(e) => set(i, { optText: e.target.value })} />
            </label>
          )}
        </div>
      ))}
      <div className="btn-row">
        <button className="btn ghost" onClick={() => onChange([...value, { id: newId(), name: '' }])}>＋ Число</button>
        <button className="btn ghost" onClick={() => onChange([...value, { id: newId(), name: '', options: [], optText: '' }])}>＋ Вариант</button>
      </div>
    </>
  );
}
