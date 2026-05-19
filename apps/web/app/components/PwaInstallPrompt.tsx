'use client';

import { useEffect, useMemo, useState } from "react";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "pwa_install_prompt_dismissed_v1";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua));
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
      setDismissed(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const showPrompt = useMemo(() => !isStandalone && !dismissed && (Boolean(deferredPrompt) || isIos), [isStandalone, dismissed, deferredPrompt, isIos]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (!showPrompt) return null;

  return (
    <aside className="fixed bottom-[5.4rem] left-1/2 z-[75] w-[calc(100%-1.25rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Instalar app</p>
          {isIos ? (
            <p className="mt-1 text-xs font-semibold text-slate-600">
              En iPhone: comparte y luego pulsa &quot;Anadir a pantalla de inicio&quot;.
            </p>
          ) : (
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Instala Talleres MALU para abrirla como app, gratis.
            </p>
          )}
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-slate-400"
          aria-label="Cerrar aviso"
          onClick={handleDismiss}
        >
          ×
        </button>
      </div>
      {!isIos ? (
        <button
          type="button"
          className="mt-2 w-full rounded-xl bg-[#0b2a4a] px-3 py-2 text-sm font-extrabold text-white"
          onClick={() => void handleInstall()}
        >
          Instalar ahora
        </button>
      ) : null}
    </aside>
  );
}
