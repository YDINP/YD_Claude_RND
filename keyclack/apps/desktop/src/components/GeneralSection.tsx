import type { Dict } from "../i18n";
import type { AppConfig } from "../ipc";
import { Switch } from "./Switch";

type GeneralSectionProps = {
  t: Dict;
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => void;
};

/** 단축키 / 자동 시작 / 시작 시 창 표시. */
export function GeneralSection({ t, config, onChange }: GeneralSectionProps) {
  return (
    <section className="card">
      <div className="section-header">
        <h2>{t.generalHeading}</h2>
      </div>

      <div className="field-row">
        <label htmlFor="mute-hotkey" className="field-label">
          {t.generalHotkey}
        </label>
        <input
          id="mute-hotkey"
          type="text"
          placeholder={t.generalHotkeyPlaceholder}
          value={config.mute_hotkey}
          onChange={(e) => onChange({ mute_hotkey: e.target.value })}
        />
      </div>

      <Switch
        id="autostart"
        checked={config.autostart}
        onChange={(v) => onChange({ autostart: v })}
        label={t.generalAutostart}
      />

      <Switch
        id="show-on-start"
        checked={config.show_window_on_start}
        onChange={(v) => onChange({ show_window_on_start: v })}
        label={t.generalShowOnStart}
      />
    </section>
  );
}
