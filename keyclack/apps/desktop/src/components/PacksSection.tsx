import { useState } from "react";
import type { Dict } from "../i18n";
import type { PackInfo } from "../ipc";

type PacksSectionProps = {
  t: Dict;
  packs: PackInfo[];
  selectedPack: string | null;
  favorites: string[];
  onSelect: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onPreview: (id: string | null) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

/** 사운드팩 목록 — 내장 합성음 + packs_dir 스캔 결과. 즐겨찾기 우선 정렬. */
export function PacksSection({
  t,
  packs,
  selectedPack,
  favorites,
  onSelect,
  onToggleFavorite,
  onPreview,
  onOpenFolder,
  onRefresh,
  refreshing,
}: PacksSectionProps) {
  const favoriteSet = new Set(favorites);
  const favoritePacks = packs
    .filter((p) => favoriteSet.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const otherPacks = packs
    .filter((p) => !favoriteSet.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

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
          id={null}
          active={selectedPack === null}
          name={t.statusBuiltin}
          meta={null}
          isFavorite={false}
          showFavorite={false}
          onClick={() => onSelect(null)}
          onToggleFavorite={onToggleFavorite}
          onPreview={onPreview}
        />

        {favoritePacks.length > 0 && (
          <li className="pack-list-label" aria-hidden="true">
            {t.packsFavoritesLabel}
          </li>
        )}
        {favoritePacks.map((pack) => (
          <PackRow
            key={pack.id}
            t={t}
            id={pack.id}
            active={selectedPack === pack.id}
            name={pack.name}
            meta={pack}
            isFavorite
            showFavorite
            onClick={() => onSelect(pack.id)}
            onToggleFavorite={onToggleFavorite}
            onPreview={onPreview}
          />
        ))}

        {otherPacks.map((pack) => (
          <PackRow
            key={pack.id}
            t={t}
            id={pack.id}
            active={selectedPack === pack.id}
            name={pack.name}
            meta={pack}
            isFavorite={false}
            showFavorite
            onClick={() => onSelect(pack.id)}
            onToggleFavorite={onToggleFavorite}
            onPreview={onPreview}
          />
        ))}
      </ul>

      {packs.length === 0 && <p className="empty-state">{t.packsEmpty}</p>}
    </section>
  );
}

function PackRow({
  t,
  id,
  active,
  name,
  meta,
  isFavorite,
  showFavorite,
  onClick,
  onToggleFavorite,
  onPreview,
}: {
  t: Dict;
  id: string | null;
  active: boolean;
  name: string;
  meta: PackInfo | null;
  isFavorite: boolean;
  showFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const [previewing, setPreviewing] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewing) return;
    setPreviewing(true);
    onPreview(id);
    window.setTimeout(() => setPreviewing(false), 1000);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (id !== null) onToggleFavorite(id);
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        className={`pack-row ${active ? "pack-row-active" : ""}`}
        onClick={onClick}
        onKeyDown={handleKeyDown}
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
        <button
          type="button"
          className="pack-preview-btn"
          onClick={handlePreview}
          disabled={previewing}
          title={t.packsPreview}
          aria-label={t.packsPreview}
        >
          {previewing ? "…" : "▶"}
        </button>
        {showFavorite && (
          <button
            type="button"
            className={`pack-favorite-btn ${isFavorite ? "pack-favorite-btn-active" : ""}`}
            onClick={handleFavorite}
            title={isFavorite ? t.packsFavoriteRemove : t.packsFavoriteAdd}
            aria-label={isFavorite ? t.packsFavoriteRemove : t.packsFavoriteAdd}
            aria-pressed={isFavorite}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        )}
      </div>
    </li>
  );
}
