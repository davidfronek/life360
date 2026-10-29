import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { timeAgo } from '../geo';
import { NAV_APPS, isMobileDevice, setNavApp, useNavApp, type NavApp } from '../navApps';

const STATE_LABEL = {
  unconfigured: 'Token není nastaven',
  ok: 'Připojeno',
  invalid: 'Token je neplatný nebo expiroval',
  error: 'Chyba spojení',
} as const;

export function Settings({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const qc = useQueryClient();
  const navApp = useNavApp();
  const mobile = isMobileDevice();
  const [token, setToken] = useState('');
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.life360Settings, refetchInterval: 5000 });

  const save = useMutation({
    mutationFn: () => api.saveLife360Token(token),
    onSuccess: () => {
      setToken('');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteLife360Token,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const members = useQuery({ queryKey: ['members'], queryFn: api.members });
  const setMe = useMutation({
    mutationFn: (id: string | null) => api.setMe(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const s = settings.data;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nastavení</h2>
        {s && (
          <p className={`status status-${s.state}`}>
            {STATE_LABEL[s.state]}
            {s.lastOkAt && <small> · poslední aktualizace {timeAgo(s.lastOkAt)}</small>}
          </p>
        )}
        <label>
          Life360 token
          <input
            type="password"
            placeholder={s?.configured ? '•••••••• (uložen, zadejte nový pro nahrazení)' : 'Vložte access token'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        {save.error && <p className="error">{(save.error as Error).message}</p>}
        <div className="row">
          <button disabled={!token || save.isPending} onClick={() => save.mutate()}>
            Ověřit a uložit
          </button>
          {s?.configured && (
            <button className="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Odebrat token
            </button>
          )}
        </div>
        {mobile && (
          <>
            <label>
              Navigační aplikace (tlačítko Navigovat)
              <select value={navApp} onChange={(e) => setNavApp(e.target.value as NavApp)}>
                {NAV_APPS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">Volba se pamatuje v tomto prohlížeči. Mapy.com a Apple Maps se na mobilu otevřou v aplikaci, pokud je nainstalovaná.</p>
          </>
        )}
        <label>
          Kdo jsem (pro „Moje poloha“ v navigaci)
          <select
            value={s?.meMemberId ?? ''}
            onChange={(e) => setMe.mutate(e.target.value || null)}
            disabled={setMe.isPending}
          >
            <option value="">— nenastaveno —</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Poloha se bere z GPS vašeho telefonu v aplikaci Life360. Určí se automaticky při uložení tokenu.
        </p>
        <p className="hint">
          Token se ukládá na serveru šifrovaně a do prohlížeče se nikdy nevrací. Data se obnovují
          každých {s?.pollIntervalSec ?? 30} s.
        </p>
        <div className="row spread">
          <button className="secondary" onClick={onLogout}>
            Odhlásit
          </button>
          <button className="secondary" onClick={onClose}>
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
