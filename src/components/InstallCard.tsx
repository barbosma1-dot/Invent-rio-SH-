import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, WifiOff } from 'lucide-react';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';

/** Instalar o app no celular (Ajustes). */
export function InstallCard() {
  const [can, setCan] = useState(canPromptInstall());
  const [online, setOnline] = useState(navigator.onLine);
  const [msg, setMsg] = useState('');
  const installed = isStandalone();

  useEffect(() => onInstallChange(() => setCan(canPromptInstall())), []);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  async function install() {
    const ok = await promptInstall();
    setMsg(ok ? 'Instalado! Procure o ícone Inventário Sh na tela inicial.' : '');
  }

  return (
    <div className="sh-card mb-4">
      <p className="inv-label mb-2">Aplicativo no celular</p>
      {!online && (
        <p className="text-sm flex items-center gap-2 mb-2" style={{ color: '#b45309' }}>
          <WifiOff size={16} /> Sem internet. Os dados só carregam quando a conexão voltar.
        </p>
      )}
      {installed ? (
        <p className="text-sm flex items-center gap-2" style={{ color: '#15803d' }}><Smartphone size={16} /> Você já está usando o app instalado.</p>
      ) : can ? (
        <button type="button" className="sh-btn sh-btn-primary" onClick={install}><Download size={18} /> Instalar o app</button>
      ) : isIos() ? (
        <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
          No iPhone: toque em <Share size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Compartilhar e depois em «Adicionar à Tela de Início».
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
          No Android: abra o menu do navegador (⋮) e toque em «Instalar app» ou «Adicionar à tela inicial».
        </p>
      )}
      {msg && <p className="text-sm font-bold mt-2" style={{ color: 'var(--sh-primary)' }}>{msg}</p>}
    </div>
  );
}
