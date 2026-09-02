import type { Dict } from "../i18n";
import type { Status } from "../ipc";

type StatusBarProps = {
  t: Dict;
  status: Status | null;
  onToggleMute: () => void;
  onIgnoreMicApp: (exe: string) => void;
  micAppIgnored: boolean;
};

function formatLatency(ms: number | null): string {
  return ms === null ? "—" : `${ms.toFixed(1)}ms`;
}

/** 상단 실시간 상태 바: 배지, 지연, 장치, 포그라운드 앱, 큰 음소거 버튼. */
export function StatusBar({
  t,
  status,
  onToggleMute,
  onIgnoreMicApp,
  micAppIgnored,
}: StatusBarProps) {
  const muted = status?.effective_muted ?? false;
  const packLabel = status
    ? status.pack_id === null
      ? t.statusBuiltin
      : status.pack_name
    : "—";

  return (
    <section className="card status-card">
      <div className="status-top">
        <div className="status-badge-group">
          <span
            className={`status-dot ${muted ? "status-dot-muted" : "status-dot-playing"}`}
          />
          <div className="status-badge-text">
            <span className="status-state">
              {muted ? t.statusMuted : t.statusPlaying}
            </span>
            <span className="status-pack">{packLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className={`mute-toggle ${muted ? "mute-toggle-muted" : ""}`}
          onClick={onToggleMute}
          disabled={!status}
        >
          {muted ? t.statusMuteOn : t.statusMuteOff}
        </button>
      </div>

      {status?.reason && (
        <div className="status-reason">
          {t.statusReasonPrefix}: {status.reason}
        </div>
      )}

      <div className="status-grid">
        <div className="status-item">
          <span className="status-item-label">{t.statusLatency}</span>
          <span className="status-item-value">
            p50 {formatLatency(status?.latency_p50_ms ?? null)} · p99{" "}
            {formatLatency(status?.latency_p99_ms ?? null)}
          </span>
        </div>
        <div className="status-item">
          <span className="status-item-label">{t.statusDevice}</span>
          <span className="status-item-value" title={status?.device ?? "—"}>
            {status?.device ?? "—"}
          </span>
        </div>
        <div className="status-item">
          <span className="status-item-label">{t.statusForeground}</span>
          <span className="status-item-value">
            {status?.foreground_exe ?? "—"}
          </span>
        </div>
        <div className="status-item status-item-mic">
          <span className="status-item-label">{t.statusMicInUse}</span>
          <div className="status-mic-row">
            <span
              className={`status-item-value ${status?.mic_in_use ? "status-mic-active" : ""}`}
            >
              {status?.mic_in_use ? (status?.mic_app ?? "●") : "—"}
            </span>
            {status?.mic_in_use && status.mic_app && !micAppIgnored && (
              <button
                type="button"
                className="btn-ghost btn-ignore-mic"
                onClick={() => onIgnoreMicApp(status.mic_app as string)}
              >
                {t.statusIgnoreThisApp}
              </button>
            )}
          </div>
        </div>
      </div>

      {status && !status.hook_installed && (
        <div className="status-warning">{t.statusHookMissing}</div>
      )}
    </section>
  );
}
