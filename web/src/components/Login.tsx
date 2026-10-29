import { useState } from 'react';
import { api } from '../api';

export function Login({ onSuccess, firstRun }: { onSuccess: () => void; firstRun: boolean }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(token);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Life360</h1>
        <p className="hint">
          {firstRun
            ? 'První spuštění: zadejte svůj Life360 token (z Home Assistantu nebo cookie LIFE360_AUTH_TOKEN). Uloží se šifrovaně a příště se přihlašujete přístupovým tokenem.'
            : 'Zadejte přístupový token aplikace (hodnota APP_ACCESS_TOKEN z .env). Life360 token se zadává až po přihlášení v Nastavení.'}
        </p>
        <label>
          {firstRun ? 'Life360 token nebo přístupový token' : 'Přístupový token'}
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy || !token}>{busy ? 'Ověřuji…' : 'Přihlásit'}</button>
      </form>
    </div>
  );
}
