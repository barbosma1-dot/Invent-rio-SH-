import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { Modal } from '../kit';

/** Abre a câmera traseira e devolve o texto do primeiro QR lido. Tem campo manual como alternativa. */
export function QRScanner({
  open, onClose, onResult,
}: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!open) return;
    setError('');
    let cancelled = false;
    let controls: IScannerControls | undefined;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não permite usar a câmera. Cole o código abaixo.');
      return;
    }

    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
        if (result && !cancelled) {
          cancelled = true;
          ctrl.stop();
          onResultRef.current(result.getText());
        }
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch(() => {
        if (!cancelled) setError('Não consegui abrir a câmera. Libere a permissão no navegador ou cole o código abaixo.');
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Ler QR do item">
      <div className="flex flex-col gap-3">
        <div style={{ borderRadius: 'var(--sh-radius-card)', overflow: 'hidden', background: '#000', aspectRatio: '1 / 1' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        {error && <p className="inv-error">{error}</p>}
        <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
          Aponte a câmera para o QR da etiqueta.
        </p>
        <div className="inv-field">
          <label className="inv-label" htmlFor="qr-manual">Ou cole o link / código</label>
          <div className="flex gap-2">
            <input id="qr-manual" className="inv-input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/i/…" />
            <button type="button" className="sh-btn sh-btn-primary" disabled={!manual.trim()} onClick={() => onResult(manual.trim())}>
              Abrir
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
