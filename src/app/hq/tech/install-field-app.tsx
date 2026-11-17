'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Install guidance for the Field PWA (Android install prompt + iOS Add to Home Screen).
 */
export default function InstallFieldApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    setIosHint(/iPhone|iPad|iPod/i.test(ua));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (installed) {
    return (
      <section className="ee-tech-panel ee-tech-account">
        <h2>Field app</h2>
        <p>Exceptional Field is installed on this device. It opens to Today and uses your HQ login.</p>
      </section>
    );
  }

  return (
    <section className="ee-tech-panel ee-tech-account">
      <h2>Install Field app</h2>
      <p>
        Add Exceptional Field to your home screen for a separate app from office HQ. Same login — opens
        straight to Today.
      </p>
      {deferred ? (
        <p style={{ marginTop: 14 }}>
          <button
            type="button"
            className="ee-tech-btn ee-tech-btn-primary"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === 'accepted') setInstalled(true);
              setDeferred(null);
            }}
          >
            Install Exceptional Field
          </button>
        </p>
      ) : null}
      {iosHint ? (
        <p>
          <small>
            On iPhone/iPad: tap Share, then <strong>Add to Home Screen</strong>, while this Field page is
            open.
          </small>
        </p>
      ) : !deferred ? (
        <p>
          <small>
            In Chrome/Edge: use the browser Install / Add to Home screen option while on Field. Office HQ
            remains a separate install from the HQ home page.
          </small>
        </p>
      ) : null}
    </section>
  );
}
