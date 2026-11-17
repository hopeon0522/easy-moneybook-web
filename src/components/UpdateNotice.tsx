import { useEffect, useState } from 'react';

// 배포된 최신 버전(version.json)과 지금 열려 있는 화면의 버전을 비교해, 다르면 새로고침 안내를 띄웁니다.
// GitHub Pages는 페이지를 최대 10분간 브라우저에 저장하므로, 새로고침할 때 주소에 버전을 붙여 저장본을 건너뜁니다.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function normalize(version: string) {
  return version.replace(/^v/, '').trim();
}

export function UpdateNotice({ currentVersion }: { currentVersion: string }) {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: string };
        if (!cancelled && data.version && normalize(data.version) !== normalize(currentVersion)) setLatest(normalize(data.version));
      } catch {
        // 오프라인이거나 로컬 개발 환경(version.json 없음)이면 조용히 넘어갑니다.
      }
    }
    void check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentVersion]);

  if (!latest || dismissed === latest) return null;

  async function reloadLatest() {
    try {
      await fetch(window.location.pathname, { cache: 'reload' });
    } catch {
      // 실패해도 아래 주소 이동으로 새 버전을 받습니다.
    }
    window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(latest ?? '')}`);
  }

  return (
    <div className="update-notice" role="status">
      <span className="update-dot" aria-hidden="true" />
      <p>새 버전 <b>v{latest}</b>이 배포됐어요. 지금 화면은 v{normalize(currentVersion)}이에요.</p>
      <button className="update-reload" onClick={() => void reloadLatest()}>새로고침</button>
      <button className="update-later" onClick={() => setDismissed(latest)}>나중에</button>
    </div>
  );
}
