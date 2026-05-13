import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  RefreshCw, Play, CheckCircle, AlertCircle,
  Clock, Database, Wifi, WifiOff, Calendar
} from 'lucide-react'

const api = axios.create({ baseURL: '/api' })

const getScraperStatus = () => api.get('/scraper/status').then(r => r.data)
const getStandings     = () => api.get('/scraper/standings/2025-2026').then(r => r.data)
const runScraper       = (payload) => api.post('/scraper/run', payload).then(r => r.data)
const startScheduler   = () => api.post('/scraper/start-scheduler').then(r => r.data)
const stopScheduler    = () => api.post('/scraper/stop-scheduler').then(r => r.data)

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? 'var(--success)' : 'var(--danger)',
      marginRight: 6, flexShrink: 0,
      boxShadow: ok ? '0 0 6px var(--success)' : 'none',
    }} />
  )
}

function Toast({ message, type, onClose }) {
  return (
    <div className={`toast ${type}`} onClick={onClose} style={{ cursor: 'pointer' }}>
      {type === 'success'
        ? <CheckCircle size={15} color="var(--success)" />
        : <AlertCircle size={15} color="var(--danger)" />}
      {message}
    </div>
  )
}

export default function ScraperPage() {
  const qc = useQueryClient()
  const [toast, setToast]     = useState(null)
  const [dryRun, setDryRun]   = useState(false)
  const [fullMode, setFull]   = useState(false)
  const [dryResult, setDry]   = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['scraper-status'],
    queryFn: getScraperStatus,
    refetchInterval: 10_000,
  })

  const { data: standings, isLoading: standingsLoading, refetch: refetchStandings } = useQuery({
    queryKey: ['standings'],
    queryFn: getStandings,
    staleTime: 60_000,
  })

  const runMutation = useMutation({
    mutationFn: runScraper,
    onSuccess: (data) => {
      if (data.dry_run) {
        setDry(data)
        showToast(`Dry run: nalezeno ${data.games_found} zápasů`, 'success')
      } else {
        showToast('Scraper spuštěn na pozadí', 'success')
        setTimeout(() => qc.invalidateQueries({ queryKey: ['scraper-status'] }), 3000)
        setTimeout(() => qc.invalidateQueries({ queryKey: ['games'] }), 5000)
      }
    },
    onError: (err) => showToast(err.response?.data?.detail ?? 'Chyba scraperu', 'error'),
  })

  const schedulerMutation = useMutation({
    mutationFn: (start) => start ? startScheduler() : stopScheduler(),
    onSuccess: (_, start) => {
      showToast(start ? 'Scheduler spuštěn' : 'Scheduler zastaven')
      qc.invalidateQueries({ queryKey: ['scraper-status'] })
    },
  })

  const isRunning = status?.running

  return (
    <div style={{ maxWidth: 900 }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="page-header">
        <h1 className="page-title">Správa dat — Scraper</h1>
        <p className="page-subtitle">
          Automatické stahování výsledků z hokejportal.cz · denní sync v 01:00
        </p>
      </div>

      {/* Status panel */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="stat-tile">
          <div className="stat-label">Scheduler</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
            <StatusDot ok={isRunning} />
            <span className="stat-value" style={{ fontSize: 20 }}>
              {statusLoading ? '…' : isRunning ? 'Aktivní' : 'Zastaven'}
            </span>
          </div>
          <div className="stat-sub">automatický denní scrape</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Poslední scrape</div>
          <div className="stat-value" style={{ fontSize: 16, marginTop: 6 }}>
            {status?.last_run
              ? new Date(status.last_run).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '—'}
          </div>
          <div className="stat-sub">{status?.last_status ?? '—'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Posledně staženo</div>
          <div className="stat-value" style={{ marginTop: 6 }}>{status?.last_count ?? '—'}</div>
          <div className="stat-sub">zápasů v posledním běhu</div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 20 }}>
        {/* Ruční spuštění */}
        <div className="card">
          <div className="card-title">Ruční spuštění scraperu</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-2)', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => setDryRun(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ color: 'var(--text)', fontWeight: 500 }}>Dry run</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Jen zobrazí data, neuloží do DB</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-2)', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={fullMode}
                onChange={e => setFull(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ color: 'var(--text)', fontWeight: 500 }}>Stáhnout detaily</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Střely, góly (pomalejší, více requestů)</div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={() => runMutation.mutate({ season: '2025-2026', dry_run: dryRun, full: fullMode, max_games: 0 })}
              disabled={runMutation.isPending}
              style={{ flex: 1 }}
            >
              <Play size={14} />
              {runMutation.isPending ? 'Spouštím…' : dryRun ? 'Spustit dry run' : 'Spustit scrape'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => refetchStandings()}
              title="Aktualizovat tabulku"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Dry run výsledek */}
          {dryResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                Dry run výsledek — {dryResult.games_found} zápasů
              </div>
              {dryResult.sample?.map((g, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-3)', minWidth: 70 }}>
                    {g.date ? new Date(g.date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                  <span className="team-code">{g.home_team}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {g.goals_home ?? '?'}:{g.goals_away ?? '?'}
                  </span>
                  <span className="team-code">{g.away_team}</span>
                  {g.ot_so === 1 && <span style={{ fontSize: 11, color: 'var(--ot)' }}>OT</span>}
                  {g.ot_so === 2 && <span style={{ fontSize: 11, color: 'var(--ot)' }}>SO</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scheduler ovládání */}
        <div className="card">
          <div className="card-title">Scheduler</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: 'var(--bg-3)', borderRadius: 'var(--radius)',
              padding: '14px 16px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Plán automatického scrapování
              </div>
              {[
                { icon: <Clock size={13} />, label: 'Každý den 01:00', desc: 'Stáhne výsledky z předchozího dne' },
                { icon: <Calendar size={13} />, label: 'Každou neděli 02:00', desc: 'Plná synchronizace sezóny + detaily' },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ color: 'var(--accent-2)', marginTop: 1 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <StatusDot ok={isRunning} />
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {isRunning ? 'Scheduler běží' : 'Scheduler je zastaven'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={() => schedulerMutation.mutate(true)}
              disabled={isRunning || schedulerMutation.isPending}
              style={{ flex: 1 }}
            >
              <Wifi size={14} /> Spustit scheduler
            </button>
            <button
              className="btn btn-danger"
              onClick={() => schedulerMutation.mutate(false)}
              disabled={!isRunning || schedulerMutation.isPending}
              style={{ flex: 1 }}
            >
              <WifiOff size={14} /> Zastavit
            </button>
          </div>
        </div>
      </div>

      {/* Tabulka ze scraperu */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="card-title" style={{ margin: 0 }}>
            Aktuální tabulka — hokejportal.cz
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => refetchStandings()}>
            <RefreshCw size={13} /> Obnovit
          </button>
        </div>

        {standingsLoading ? (
          <div className="spinner" />
        ) : !standings || standings.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
            Nepodařilo se načíst tabulku z hokejportal.cz.<br />
            <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
              Zkontrolujte připojení k internetu nebo spusťte scraper ručně.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Tým</th>
                  <th style={{ textAlign: 'center' }}>Z</th>
                  <th style={{ textAlign: 'center' }}>V</th>
                  <th style={{ textAlign: 'center' }}>VP</th>
                  <th style={{ textAlign: 'center' }}>PP</th>
                  <th style={{ textAlign: 'center' }}>P</th>
                  <th style={{ textAlign: 'center' }}>Góly</th>
                  <th style={{ textAlign: 'center' }}>+/-</th>
                  <th style={{ textAlign: 'center' }}>Body</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.rank}>
                    <td style={{ color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-display)', textAlign: 'center' }}>
                      {s.rank}.
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="team-code">{s.team_code}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.team_name}</span>
                      </div>
                    </td>
                    <td className="num muted">{s.games ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--success)' }}>{s.wins ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--ot)' }}>{s.wins_ot ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--ot)', opacity: .7 }}>{s.losses_ot ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--danger)' }}>{s.losses ?? '—'}</td>
                    <td className="num muted" style={{ fontSize: 12 }}>
                      {s.gf != null ? `${s.gf}:${s.ga}` : '—'}
                    </td>
                    <td className="num" style={{ color: (s.diff ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
                      {s.diff != null ? (s.diff > 0 ? `+${s.diff}` : s.diff) : '—'}
                    </td>
                    <td>
                      <div style={{
                        fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                        color: 'var(--text)', textAlign: 'center',
                      }}>
                        {s.points ?? '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}