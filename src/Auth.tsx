import React, { useState } from 'react';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { supabase } from './lib/supabase';
import { GoogleLogin } from './kit';
import { LOGO_FOR_DARK, LOGO_FOR_LIGHT } from './brand';

function traduzir(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  return msg;
}

// O cadastro de pessoas NÃO é feito aqui: usuários, nível e setor vêm do hub dos apps Shalom (tarefa T3).
export function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(traduzir(err.message));
    setLoading(false);
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6" style={{ background: 'var(--sh-bg)' }}>
      <div className="w-full" style={{ maxWidth: '26rem' }}>
        <div className="mb-8 text-center">
          <img src={LOGO_FOR_LIGHT} alt="Inventário Sh" className="mx-auto sh-show-light" style={{ width: '12rem', height: 'auto' }} />
          <img src={LOGO_FOR_DARK} alt="Inventário Sh" className="mx-auto sh-show-dark" style={{ width: '12rem', height: 'auto' }} />
        </div>

        <div className="sh-card" style={{ padding: '1.25rem' }}>
          <h1 className="text-xl font-extrabold mb-1">Bem-vindo</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--sh-text-muted)' }}>
            Entre com o mesmo e-mail do seu cadastro nos apps Shalom.
          </p>

          <form onSubmit={entrar} className="flex flex-col gap-4">
            <label className="inv-field">
              <span className="inv-label">E-mail</span>
              <div className="relative">
                <Mail size={18} className="absolute" style={{ left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sh-text-faint)' }} />
                <input
                  className="inv-input"
                  style={{ paddingLeft: '2.6rem' }}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            <label className="inv-field">
              <span className="inv-label">Senha</span>
              <div className="relative">
                <Lock size={18} className="absolute" style={{ left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sh-text-faint)' }} />
                <input
                  className="inv-input"
                  style={{ paddingLeft: '2.6rem' }}
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </label>

            {error && <div className="inv-error" role="alert">{error}</div>}

            <button type="submit" className="sh-btn sh-btn-primary sh-btn-block" disabled={loading}>
              {loading ? 'Entrando...' : (<>Entrar <ArrowRight size={18} /></>)}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4 text-xs font-bold uppercase" style={{ color: 'var(--sh-text-faint)', letterSpacing: '0.1em' }}>
            <span className="flex-1" style={{ height: 1, background: 'var(--sh-border)' }} />
            ou
            <span className="flex-1" style={{ height: 1, background: 'var(--sh-border)' }} />
          </div>

          <GoogleLogin supabase={supabase!} redirectTo={window.location.href} onError={setError} />
        </div>
      </div>
    </div>
  );
}
