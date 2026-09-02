import type { Dict } from "../i18n";

type FooterProps = {
  t: Dict;
  keyCount: number | null;
  lastError: string | null;
};

/** 키 입력 수 + 개인정보 문구 + (있다면) 마지막 오류 배너. */
export function Footer({ t, keyCount, lastError }: FooterProps) {
  return (
    <footer className="app-footer">
      {lastError && <div className="error-banner">{lastError}</div>}
      <div className="footer-info">
        <span className="footer-key-count">
          {t.footerKeyCount}: {keyCount ?? 0}
        </span>
        <span className="footer-privacy">{t.footerPrivacy}</span>
      </div>
    </footer>
  );
}
