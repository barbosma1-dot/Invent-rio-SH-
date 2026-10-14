// Guarda o convite de instalação do navegador (Chrome/Android) para usar no botão de Ajustes.
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const canPromptInstall = () => !!deferred;
export function onInstallChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null; notify();
  return r.outcome === 'accepted';
}
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
