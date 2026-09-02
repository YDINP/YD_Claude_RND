import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { useI18n } from "./i18n";
import {
  getConfig,
  getStatus,
  listDevices,
  listPacks,
  onStatus,
  openPacksDir,
  setConfig as saveConfig,
  toggleMute,
  type AppConfig,
  type PackInfo,
  type Status,
} from "./ipc";
import { StatusBar } from "./components/StatusBar";
import { PacksSection } from "./components/PacksSection";
import { SoundSection } from "./components/SoundSection";
import { RulesSection } from "./components/RulesSection";
import { GeneralSection } from "./components/GeneralSection";
import { Footer } from "./components/Footer";

const SAVE_DEBOUNCE_MS = 300;

function App() {
  const { lang, toggleLang, t } = useI18n();

  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [refreshingPacks, setRefreshingPacks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);

  const refreshPacks = useCallback(async () => {
    setRefreshingPacks(true);
    try {
      setPacks(await listPacks());
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setRefreshingPacks(false);
    }
  }, []);

  // 초기 로드 + 실시간 상태 구독
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [initialStatus, initialConfig, initialPacks, initialDevices] =
          await Promise.all([
            getStatus(),
            getConfig(),
            listPacks(),
            listDevices(),
          ]);
        if (cancelled) return;
        setStatus(initialStatus);
        setConfig(initialConfig);
        setPacks(initialPacks);
        setDevices(initialDevices);
      } catch (err) {
        if (!cancelled) setLoadError(String(err));
      }
    })();

    const unlistenPromise = onStatus((next) => {
      if (!cancelled) setStatus(next);
    });

    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten());
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = useCallback((next: AppConfig) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const saved = await saveConfig(next);
        setConfig(saved);
      } catch (err) {
        setLoadError(String(err));
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<AppConfig>) => {
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleToggleMute = useCallback(async () => {
    try {
      await toggleMute();
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      await openPacksDir();
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  const handleIgnoreMicApp = useCallback(
    (exe: string) => {
      setConfig((prev) => {
        if (!prev) return prev;
        if (prev.meeting_ignore.some((e) => e.toLowerCase() === exe.toLowerCase())) {
          return prev;
        }
        const next = { ...prev, meeting_ignore: [...prev.meeting_ignore, exe] };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const bannerError = loadError ?? status?.last_error ?? null;
  const micAppIgnored = Boolean(
    status?.mic_app &&
      config?.meeting_ignore.some(
        (e) => e.toLowerCase() === status.mic_app?.toLowerCase(),
      ),
  );

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">{t.appTitle}</span>
        <button type="button" className="lang-toggle" onClick={toggleLang}>
          {lang === "ko" ? "EN" : "KO"}
        </button>
      </header>

      <main className="app-body">
        <StatusBar
          t={t}
          status={status}
          onToggleMute={handleToggleMute}
          onIgnoreMicApp={handleIgnoreMicApp}
          micAppIgnored={micAppIgnored}
        />

        <PacksSection
          t={t}
          packs={packs}
          selectedPack={config?.pack ?? null}
          onSelect={(id) => updateConfig({ pack: id })}
          onOpenFolder={handleOpenFolder}
          onRefresh={refreshPacks}
          refreshing={refreshingPacks}
        />

        {config && (
          <>
            <SoundSection
              t={t}
              config={config}
              devices={devices}
              onChange={updateConfig}
            />

            <RulesSection
              t={t}
              config={config}
              packs={packs}
              foregroundExe={status?.foreground_exe ?? null}
              onChange={updateConfig}
            />

            <GeneralSection t={t} config={config} onChange={updateConfig} />
          </>
        )}
      </main>

      <Footer t={t} keyCount={status?.key_count ?? null} lastError={bannerError} />
    </div>
  );
}

export default App;
