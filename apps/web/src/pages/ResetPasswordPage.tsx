import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 6) { setError('Minimum 6 caractères.'); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => { window.location.hash = '/'; }, 2500);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-5">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center">
          <span className="text-white font-black text-lg">K</span>
        </div>
        <div>
          <h2 className="font-black text-gray-900 text-xl">Nouveau mot de passe</h2>
          <p className="text-sm text-gray-500 mt-1">Choisissez un nouveau mot de passe sécurisé.</p>
        </div>
        {done ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
            Mot de passe mis à jour. Redirection en cours...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe" minLength={6}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password" required value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirmer le mot de passe"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Mettre à jour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
