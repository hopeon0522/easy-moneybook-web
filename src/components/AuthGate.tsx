import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent, mode: 'signin' | 'signup') {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const result =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setMessage('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <div className="grid min-h-screen place-items-center bg-[#f6f6f8] text-sm text-zinc-500">로그인 확인 중...</div>;
  }
  if (session) return <>{children}</>;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f6f8] px-4 text-zinc-950">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold text-[#ff5a52]">PRIVATE MONEY BOOK</p>
          <h1 className="mt-1 text-2xl font-semibold">EasyMoneyBook Web</h1>
          <p className="mt-2 text-sm text-zinc-500">개인 가계부 데이터는 로그인한 계정에만 표시됩니다.</p>
        </div>
        <form className="space-y-3">
          <label className="block text-sm font-medium">
            이메일
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-[#ff5a52]"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            비밀번호
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-[#ff5a52]"
              type="password"
              autoComplete="current-password"
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message && <p className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-700">{message}</p>}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              className="rounded-lg bg-[#ff5a52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={submitting}
              onClick={(event) => void submit(event, 'signin')}
            >
              로그인
            </button>
            <button
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              disabled={submitting}
              onClick={(event) => void submit(event, 'signup')}
            >
              계정 만들기
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
