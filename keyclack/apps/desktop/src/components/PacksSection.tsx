import type { Dict } from "../i18n";
import type { PackInfo } from "../ipc";

type PacksSectionProps = {
  t: Dict;
  packs: PackInfo[];
  selectedPack: string | null;
  onSelect: (id: string | null) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

/** 사운드팩 목록 — 내장 합성음 + packs_dir 스캔 결과. */
export function PacksSection({
  t,
  packs,
  selectedPack,
  onSelect,
  onOpenFolder,
  onRefresh,
  refreshing,
}: PacksSectionProps) {
  return (
    <section className="card">
      <div className="section-header">
        <h2>{t.packsHeading}</h2>
        <div className="section-actions">
          <button type="button" className="btn-ghost" onClick={onRefresh}>
            {refreshing ? "…" : t.packsRefresh}
          </button>
          <button type="button" className="btn-ghost" onClick={onOpenFolder}>
            {t.packsOpenFolder}
          </button>
        </div>
      </div>

      <ul className="pack-list">
        <PackRow
          t={t}
          active={selectedPack === null}
          name={t.statusBuiltin}
          meta={null}
          onClick={() => onSelect(null)}
        />
        {packs.map((pack) => (
          <PackRow
            key={pack.id}
            t={t}
            active={selectedPack === pack.id}
            name={pack.name}
            meta={pack}
            onClick={() => onSelect(pack.id)}
          />
        ))}
      </ul>

      {packs.length === 0 && <p className="empty-state">{t.packsEmpty}</p>}
    </section>
  );
}

function PackRow({
  t,
  active,
  name,
  meta,
  onClick,
}: {
  t: Dict;
  active: boolean;
  name: string;
  meta: PackInfo | null;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`pack-row ${active ? "pack-row-active" : ""}`}
        onClick={onClick}
      >
        <span className={`pack-radio ${active ? "pack-radio-active" : ""}`} />
        <span className="pack-info">
          <span className="pack-name">{name}</span>
          {meta && (
            <span className="pack-meta">
              {meta.key_count} {t.packsKeys} · {t.packsHasUp}{" "}
              {meta.has_up ? t.packsYes : t.packsNo} · {t.packsVersion}{" "}
              {meta.version}
            </span>
          )}
        </span>
        {active && <span className="pack-selected-tag">{t.packsSelected}</span>}
      </button>
    </li>
  );
}
