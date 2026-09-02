import { useState } from "react";
import type { Dict } from "../i18n";
import type { AppConfig, AppRule, PackInfo, RuleAction } from "../ipc";
import { Switch } from "./Switch";

type RulesSectionProps = {
  t: Dict;
  config: AppConfig;
  packs: PackInfo[];
  foregroundExe: string | null;
  onChange: (patch: Partial<AppConfig>) => void;
};

type ActionKind = RuleAction["type"];

function defaultActionFor(kind: ActionKind, packs: PackInfo[]): RuleAction {
  switch (kind) {
    case "mute":
      return { type: "mute" };
    case "pack":
      return { type: "pack", id: packs[0]?.id ?? "" };
    case "volume":
      return { type: "volume", value: 0.5 };
  }
}

/** 앱별 규칙 테이블 — 음소거 / 팩 지정 / 볼륨. + 회의 자동 음소거. */
export function RulesSection({
  t,
  config,
  packs,
  foregroundExe,
  onChange,
}: RulesSectionProps) {
  const rules = config.rules;

  const updateRule = (index: number, patch: Partial<AppRule>) => {
    onChange({
      rules: rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  };

  const updateAction = (index: number, action: RuleAction) =>
    updateRule(index, { action });

  const deleteRule = (index: number) =>
    onChange({ rules: rules.filter((_, i) => i !== index) });

  const addRule = (exe = "") => {
    const rule: AppRule = { exe, action: { type: "mute" }, enabled: true };
    onChange({ rules: [...rules, rule] });
  };

  const addCurrentApp = () => {
    if (foregroundExe) addRule(foregroundExe);
  };

  const [ignoreInput, setIgnoreInput] = useState("");
  const meetingIgnore = config.meeting_ignore;

  const addIgnore = () => {
    const exe = ignoreInput.trim();
    if (!exe) return;
    if (!meetingIgnore.some((e) => e.toLowerCase() === exe.toLowerCase())) {
      onChange({ meeting_ignore: [...meetingIgnore, exe] });
    }
    setIgnoreInput("");
  };

  const removeIgnore = (exe: string) =>
    onChange({ meeting_ignore: meetingIgnore.filter((e) => e !== exe) });

  return (
    <section className="card">
      <div className="section-header">
        <h2>{t.rulesHeading}</h2>
        <div className="section-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={addCurrentApp}
            disabled={!foregroundExe}
          >
            {t.rulesAddCurrent}
          </button>
          <button type="button" className="btn-primary" onClick={() => addRule()}>
            {t.rulesAdd}
          </button>
        </div>
      </div>

      {rules.length === 0 && <p className="empty-state">{t.rulesEmpty}</p>}

      {rules.length > 0 && (
        <ul className="rule-list">
          {rules.map((rule, index) => (
            <li key={index} className="rule-row">
              <input
                className="rule-exe-input"
                type="text"
                placeholder={t.rulesExePlaceholder}
                value={rule.exe}
                onChange={(e) => updateRule(index, { exe: e.target.value })}
              />

              <select
                className="rule-action-select"
                value={rule.action.type}
                onChange={(e) =>
                  updateAction(
                    index,
                    defaultActionFor(e.target.value as ActionKind, packs),
                  )
                }
              >
                <option value="mute">{t.rulesActionMute}</option>
                <option value="pack">{t.rulesActionPack}</option>
                <option value="volume">{t.rulesActionVolume}</option>
              </select>

              {rule.action.type === "pack" && (
                <select
                  className="rule-action-detail"
                  value={rule.action.id}
                  onChange={(e) =>
                    updateAction(index, { type: "pack", id: e.target.value })
                  }
                >
                  {packs.length === 0 && <option value="">—</option>}
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {rule.action.type === "volume" && (
                <input
                  className="rule-action-detail rule-volume-input"
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(rule.action.value * 100)}
                  onChange={(e) =>
                    updateAction(index, {
                      type: "volume",
                      value: Number(e.target.value) / 100,
                    })
                  }
                />
              )}

              <label className="rule-active-toggle" title={t.rulesActive}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    updateRule(index, { enabled: e.target.checked })
                  }
                />
                <span>{t.rulesActive}</span>
              </label>

              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteRule(index)}
                aria-label={t.rulesDelete}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <Switch
        id="meeting-auto-mute"
        checked={config.meeting_auto_mute}
        onChange={(v) => onChange({ meeting_auto_mute: v })}
        label={t.rulesMeetingAutoMute}
        description={t.rulesMeetingAutoMuteDesc}
      />

      <div className="ignore-list-block">
        <span className="field-label">{t.rulesIgnoreListHeading}</span>
        <span className="field-description">{t.rulesIgnoreListDesc}</span>

        <div className="chip-row">
          {meetingIgnore.length === 0 && (
            <span className="empty-state chip-empty">{t.rulesIgnoreEmpty}</span>
          )}
          {meetingIgnore.map((exe) => (
            <span key={exe} className="chip">
              {exe}
              <button
                type="button"
                className="chip-remove"
                onClick={() => removeIgnore(exe)}
                aria-label={t.rulesIgnoreRemove}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="chip-input-row">
          <input
            type="text"
            placeholder={t.rulesIgnorePlaceholder}
            value={ignoreInput}
            onChange={(e) => setIgnoreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addIgnore();
              }
            }}
          />
          <button type="button" className="btn-ghost" onClick={addIgnore}>
            {t.rulesIgnoreAdd}
          </button>
        </div>
      </div>
    </section>
  );
}
