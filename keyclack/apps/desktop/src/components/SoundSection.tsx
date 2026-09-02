import type { Dict } from "../i18n";
import type { AppConfig } from "../ipc";
import { Switch } from "./Switch";

type SoundSectionProps = {
  t: Dict;
  config: AppConfig;
  devices: string[];
  onChange: (patch: Partial<AppConfig>) => void;
};

/** 볼륨 / 키업 / 반복 / 출력 장치 / 독점 모드. */
export function SoundSection({ t, config, devices, onChange }: SoundSectionProps) {
  const volumePercent = Math.round(config.volume * 100);

  return (
    <section className="card">
      <div className="section-header">
        <h2>{t.soundHeading}</h2>
      </div>

      <div className="field-row">
        <label htmlFor="volume-slider" className="field-label">
          {t.soundVolume}
        </label>
        <div className="slider-row">
          <input
            id="volume-slider"
            type="range"
            min={0}
            max={100}
            value={volumePercent}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
          />
          <span className="slider-value">{volumePercent}%</span>
        </div>
      </div>

      <Switch
        id="play-up"
        checked={config.play_up}
        onChange={(v) => onChange({ play_up: v })}
        label={t.soundPlayUp}
      />

      <Switch
        id="allow-repeat"
        checked={config.allow_repeat}
        onChange={(v) => onChange({ allow_repeat: v })}
        label={t.soundAllowRepeat}
      />

      <div className="field-row">
        <label htmlFor="device-select" className="field-label">
          {t.soundDevice}
        </label>
        <select
          id="device-select"
          value={config.device ?? ""}
          onChange={(e) =>
            onChange({ device: e.target.value === "" ? null : e.target.value })
          }
        >
          <option value="">{t.soundDeviceDefault}</option>
          {devices.map((device) => (
            <option key={device} value={device}>
              {device}
            </option>
          ))}
        </select>
      </div>

      <Switch
        id="exclusive-mode"
        checked={config.exclusive}
        onChange={(v) => onChange({ exclusive: v })}
        label={t.soundExclusive}
        description={t.soundExclusiveWarning}
      />
    </section>
  );
}
