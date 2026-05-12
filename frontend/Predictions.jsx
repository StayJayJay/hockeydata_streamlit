import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { predictMatch, getTeams, getTeamGoalies, getSeasons, getTeamForm, getTeamStats } from '../services/api'
import { TrendingUp, AlertCircle } from 'lucide-react'

function FormDots({ results = [] }) {
  return (
    <div className="form-dots">
      {(results.length ? results : ['?','?','?','?','?']).map((r, i) => (
        <div key={i} className={`form-dot dot-${r}`} title={r} />
      ))}
    </div>
  )
}

function StatRow({ label, home, away, format = v => v }) {
  const fh = home != null ? format(home) : '—'
  const fa = away != null ? format(away) : '—'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--accent-2)', textAlign: 'right' }}>{fh}</span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', minWidth: 100 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>{fa}</span>
    </div>
  )
}

export default function Predictions() {
  const [form, setForm] = useState({ home: '', away: '', season: '25/26', game_type: 'RS', home_goalie: '', away_goalie: '' })
  const [result, setResult] = useState(null)

  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  const { data: seasons } = useQuery({ queryKey: ['seasons'], queryFn: getSeasons })
  const { data: homeGoalies } = useQuery({ queryKey: ['goalies', form.home], queryFn: () => getTeamGoalies(form.home), enabled: !!form.home })
  const { data: awayGoalies } = useQuery({ queryKey: ['goalies', form.away], queryFn: () => getTeamGoalies(form.away), enabled: !!form.away })
  const { data: homeForm } = useQuery({ queryKey: ['form', form.season, form.home], queryFn: () => getTeamForm(form.season, form.home), enabled: !!form.home && !!form.season })
  const { data: awayForm } = useQuery({ queryKey: ['form', form.season, form.away], queryFn: () => getTeamForm(form.season, form.away), enabled: !!form.away && !!form.season })
  const { data: homeStats } = useQuery({ queryKey: ['stats', form.season, form.home, form.game_type], queryFn: () => getTeamStats(form.season, form.home, form.game_type), enabled: !!form.home && !!form.season })
  const { data: awayStats } = useQuery({ queryKey: ['stats', form.season, form.away, form.game_type], queryFn: () => getTeamStats(form.season, form.away, form.game_type), enabled: !!form.away && !!form.season })

  const mutation = useMutation({
    mutationFn: predictMatch,
    onSuccess: data => setResult(data),
    onError: err => setResult({ error: err.response?.data?.detail ?? 'Chyba při výpočtu predikce' }),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePredict = () => {
    if (!form.home || !form.away || !form.season) return
    mutation.mutate({ home_team: form.home, away_team: form.away, season: form.season, game_type: form.game_type, home_goalie: form.home_goalie || null, away_goalie: form.away_goalie || null })
  }

  const pHome = result?.p_home_win
  const pAway = result?.p_away_win

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Predikce zápasu</h1>
        <p className="page-subtitle">Logistický model s Minitab parametry — xG, PP%, brankář</p>
      </div>

      {/* Config */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-section-title">Nastavení predikce</div>
        <div className="form-grid" style={{ gridTemplateColumns: '120px 120px', gap: 12, marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">Sezóna</label>
            <select className="form-select" value={form.season} onChange={e => set('season', e.target.value)}>
              {seasons?.map(s => <option key={s.id} value={s.code}>{s.code}</option>) ?? <option value="25/26">25/26</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Typ</label>
            <select className="form-select" value={form.game_type} onChange={e => set('game_type', e.target.value)}>
              <option value="RS">Základní část</option>
              <option value="PO">Playoff</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 16, alignItems: 'end' }}>
          <div>
            <div style={{ color: 'var(--accent-2)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              DOMÁCÍ
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Tým</label>
              <select className="form-select" value={form.home} onChange={e => { set('home', e.target.value); set('home_goalie', '') }}>
                <option value="">— vyberte —</option>
                {teams?.filter(t => t.code !== form.away).map(t => <option key={t.id} value={t.code}>{t.code} – {t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Brankář (volitelné)</label>
              {homeGoalies?.length > 0 ? (
                <select className="form-select" value={form.home_goalie} onChange={e => set('home_goalie', e.target.value)}>
                  <option value="">— výběr brankáře —</option>
                  {homeGoalies.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              ) : (
                <input type="text" className="form-input" placeholder="Příjmení brankáře" value={form.home_goalie} onChange={e => set('home_goalie', e.target.value)} />
              )}
            </div>
            {homeForm && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Forma:</span>
                <FormDots results={homeForm.results} />
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', paddingBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-3)', fontWeight: 300 }}>vs</span>
          </div>

          <div>
            <div style={{ color: 'var(--danger)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              HOSTÉ
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Tým</label>
              <select className="form-select" value={form.away} onChange={e => { set('away', e.target.value); set('away_goalie', '') }}>
                <option value="">— vyberte —</option>
                {teams?.filter(t => t.code !== form.home).map(t => <option key={t.id} value={t.code}>{t.code} – {t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Brankář (volitelné)</label>
              {awayGoalies?.length > 0 ? (
                <select className="form-select" value={form.away_goalie} onChange={e => set('away_goalie', e.target.value)}>
                  <option value="">— výběr brankáře —</option>
                  {awayGoalies.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              ) : (
                <input type="text" className="form-input" placeholder="Příjmení brankáře" value={form.away_goalie} onChange={e => set('away_goalie', e.target.value)} />
              )}
            </div>
            {awayForm && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Forma:</span>
                <FormDots results={awayForm.results} />
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handlePredict} disabled={!form.home || !form.away || mutation.isPending} style={{ minWidth: 200 }}>
            <TrendingUp size={14} /> {mutation.isPending ? 'Počítám...' : 'Spustit predikci'}
          </button>
        </div>
      </div>

      {/* Stats comparison (always visible when both teams selected) */}
      {homeStats && awayStats && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-section-title">Srovnání statistik — {form.season}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr 1fr', gap: 4, marginBottom: 8, paddingBottom: 4 }}>
            <span style={{ color: 'var(--accent-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700 }}>{form.home}</span>
            <span></span>
            <span style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{form.away}</span>
          </div>
          <StatRow label="Průměrný xG rozdíl" home={homeStats.avg_xg_diff} away={awayStats.avg_xg_diff} format={v => v?.toFixed(3)} />
          <StatRow label="Průměrný střelecký rozdíl" home={homeStats.avg_shots_diff} away={awayStats.avg_shots_diff} format={v => v?.toFixed(1)} />
          <StatRow label="PP%" home={homeStats.avg_pp_rate} away={awayStats.avg_pp_rate} format={v => `${(v*100).toFixed(1)}%`} />
          <StatRow label="PK%" home={homeStats.avg_pk_rate} away={awayStats.avg_pk_rate} format={v => `${(v*100).toFixed(1)}%`} />
          <StatRow label="Výhra%" home={homeStats.win_pct} away={awayStats.win_pct} format={v => `${(v*100).toFixed(1)}%`} />
          <StatRow label="Zápasy" home={homeStats.games} away={awayStats.games} />
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <div className="card">
          <div className="form-section-title">Výsledek predikce</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'center', marginBottom: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{result.home_team}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--accent-2)', marginTop: 4 }}>{(pHome * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>šance na výhru</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-3)', fontWeight: 300 }}>vs</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{result.away_team}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--danger)', marginTop: 4 }}>{(pAway * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>šance na výhru</div>
            </div>
          </div>

          <div className="pred-bar-wrap">
            <div className="pred-bar-track">
              <div className="pred-bar-home" style={{ width: `${pHome * 100}%` }} />
              <div className="pred-bar-away" style={{ width: `${pAway * 100}%` }} />
            </div>
          </div>
          <div className="pred-labels">
            <span className="pred-pct-home">{result.home_team} {(pHome * 100).toFixed(1)}%</span>
            <span className="pred-model-label">model: Logistická regrese · {result.game_type}</span>
            <span className="pred-pct-away">{(pAway * 100).toFixed(1)}% {result.away_team}</span>
          </div>

          {/* Model inputs detail */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Detail modelu</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {[
                { label: 'Intercept', val: result.model_inputs?.intercept },
                { label: 'Home bonus', val: result.model_inputs?.home_bonus },
                { label: 'xG diff', val: result.model_inputs?.xg_diff },
                { label: 'PP diff', val: result.model_inputs?.pp_diff },
                { label: 'Linear score', val: result.linear_score },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: val > 0 ? 'var(--success)' : val < 0 ? 'var(--danger)' : 'var(--text)' }}>
                    {val != null ? val.toFixed(4) : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
          <AlertCircle size={16} />
          <span>{result.error}</span>
        </div>
      )}
    </div>
  )
}
