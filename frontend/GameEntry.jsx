import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createGame, getTeams, getTeamGoalies, getSeasons } from '../services/api'
import { CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

const INITIAL = {
  season_code: '25/26',
  home_team_code: '',
  away_team_code: '',
  date: new Date().toISOString().slice(0, 10),
  round: '',
  game_type: 'RS',
  goals_home: '', goals_away: '',
  shots_home: '', shots_away: '',
  xg_home: '',   xg_away: '',
  ot_so: 0,
  home_pp_o: '', home_pp_g: '', home_pk_o: '', home_pk_ga: '',
  away_pp_o: '', away_pp_g: '', away_pk_o: '', away_pk_ga: '',
  home_goalie: '', home_goalie_shots: '', home_goalie_saves: '', home_goalie_ga: '',
  away_goalie: '', away_goalie_shots: '', away_goalie_saves: '', away_goalie_ga: '',
}

function Toast({ message, type, onClose }) {
  return (
    <div className={`toast ${type}`} onClick={onClose} style={{ cursor: 'pointer' }}>
      {type === 'success' ? <CheckCircle size={16} color="var(--success)" /> : <AlertCircle size={16} color="var(--danger)" />}
      {message}
    </div>
  )
}

export default function GameEntry() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState(INITIAL)
  const [toast, setToast] = useState(null)

  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  const { data: seasons } = useQuery({ queryKey: ['seasons'], queryFn: getSeasons })

  const { data: homeGoalies } = useQuery({
    queryKey: ['goalies', form.home_team_code],
    queryFn: () => getTeamGoalies(form.home_team_code),
    enabled: !!form.home_team_code,
  })
  const { data: awayGoalies } = useQuery({
    queryKey: ['goalies', form.away_team_code],
    queryFn: () => getTeamGoalies(form.away_team_code),
    enabled: !!form.away_team_code,
  })

  const mutation = useMutation({
    mutationFn: createGame,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setToast({ message: `Zápas úspěšně uložen (ID: ${data.id})`, type: 'success' })
      setTimeout(() => { setToast(null); navigate('/games') }, 2000)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail ?? 'Chyba při ukládání'
      setToast({ message: msg, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const num = (v) => v === '' ? null : Number(v)

  const handleSubmit = () => {
    if (!form.home_team_code || !form.away_team_code || !form.date || !form.season_code) {
      setToast({ message: 'Vyplňte povinná pole: sezóna, datum, oba týmy', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    if (form.home_team_code === form.away_team_code) {
      setToast({ message: 'Domácí a hostující tým nemohou být stejní', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    mutation.mutate({
      ...form,
      round: num(form.round),
      ot_so: Number(form.ot_so),
      goals_home: num(form.goals_home), goals_away: num(form.goals_away),
      shots_home: num(form.shots_home), shots_away: num(form.shots_away),
      xg_home: num(form.xg_home),   xg_away: num(form.xg_away),
      home_pp_o: num(form.home_pp_o), home_pp_g: num(form.home_pp_g),
      home_pk_o: num(form.home_pk_o), home_pk_ga: num(form.home_pk_ga),
      away_pp_o: num(form.away_pp_o), away_pp_g: num(form.away_pp_g),
      away_pk_o: num(form.away_pk_o), away_pk_ga: num(form.away_pk_ga),
      home_goalie: form.home_goalie || null,
      home_goalie_shots: num(form.home_goalie_shots), home_goalie_saves: num(form.home_goalie_saves),
      home_goalie_ga: num(form.home_goalie_ga),
      away_goalie: form.away_goalie || null,
      away_goalie_shots: num(form.away_goalie_shots), away_goalie_saves: num(form.away_goalie_saves),
      away_goalie_ga: num(form.away_goalie_ga),
    })
  }

  const homeTeam = teams?.find(t => t.code === form.home_team_code)
  const awayTeam = teams?.find(t => t.code === form.away_team_code)

  return (
    <div style={{ maxWidth: 860 }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/games')}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="page-title">Zadat zápas</h1>
          <p className="page-subtitle">Ruční zadání výsledku a statistik zápasu</p>
        </div>
      </div>

      {/* ── Sekce 1: Základní info ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-section-title">Základní informace</div>
        <div className="form-grid form-grid-4" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">Sezóna *</label>
            <select className="form-select" value={form.season_code} onChange={e => set('season_code', e.target.value)}>
              {seasons?.map(s => <option key={s.id} value={s.code}>{s.code}</option>) ??
                <option value="25/26">25/26</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Datum *</label>
            <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Kolo</label>
            <input type="number" className="form-input" placeholder="např. 42" value={form.round} onChange={e => set('round', e.target.value)} min={1} />
          </div>
          <div className="form-group">
            <label className="form-label">Typ zápasu</label>
            <select className="form-select" value={form.game_type} onChange={e => set('game_type', e.target.value)}>
              <option value="RS">Základní část (RS)</option>
              <option value="PO">Playoff (PO)</option>
            </select>
          </div>
        </div>

        {/* Teams + score */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label">Domácí tým *</label>
            <select className="form-select" value={form.home_team_code} onChange={e => set('home_team_code', e.target.value)}>
              <option value="">— vyberte tým —</option>
              {teams?.filter(t => t.code !== form.away_team_code).map(t => (
                <option key={t.id} value={t.code}>{t.code} – {t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ textAlign: 'center', paddingBottom: 2 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-3)', lineHeight: 1 }}>vs</div>
          </div>

          <div className="form-group">
            <label className="form-label">Hostující tým *</label>
            <select className="form-select" value={form.away_team_code} onChange={e => set('away_team_code', e.target.value)}>
              <option value="">— vyberte tým —</option>
              {teams?.filter(t => t.code !== form.home_team_code).map(t => (
                <option key={t.id} value={t.code}>{t.code} – {t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Sekce 2: Výsledek ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-section-title">Výsledek &amp; střely</div>
        <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              {homeTeam?.code ?? 'Domácí'}
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Góly</label>
                <input type="number" className="form-input" value={form.goals_home} onChange={e => set('goals_home', e.target.value)} min={0} max={20} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Střely</label>
                <input type="number" className="form-input" value={form.shots_home} onChange={e => set('shots_home', e.target.value)} min={0} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">xG domácí</label>
                <input type="number" className="form-input" value={form.xg_home} onChange={e => set('xg_home', e.target.value)} step={0.01} min={0} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              {awayTeam?.code ?? 'Hosté'}
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Góly</label>
                <input type="number" className="form-input" value={form.goals_away} onChange={e => set('goals_away', e.target.value)} min={0} max={20} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Střely</label>
                <input type="number" className="form-input" value={form.shots_away} onChange={e => set('shots_away', e.target.value)} min={0} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">xG hosté</label>
                <input type="number" className="form-input" value={form.xg_away} onChange={e => set('xg_away', e.target.value)} step={0.01} min={0} placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>

        <div className="form-group" style={{ maxWidth: 200 }}>
          <label className="form-label">Prodloužení / nájezdy</label>
          <select className="form-select" value={form.ot_so} onChange={e => set('ot_so', e.target.value)}>
            <option value={0}>Regulérní čas</option>
            <option value={1}>Prodloužení (OT)</option>
            <option value={2}>Nájezdy (SO)</option>
          </select>
        </div>
      </div>

      {/* ── Sekce 3: PP/PK ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-section-title">Přesilovky &amp; oslabení</div>
        <div className="form-grid form-grid-2">
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              {homeTeam?.code ?? 'Domácí'}
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[['home_pp_o','PP Příl.'],['home_pp_g','PP Góly'],['home_pk_o','PK Příl.'],['home_pk_ga','PK GA']].map(([k, label]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{label}</label>
                  <input type="number" className="form-input" value={form[k]} onChange={e => set(k, e.target.value)} min={0} placeholder="0" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              {awayTeam?.code ?? 'Hosté'}
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[['away_pp_o','PP Příl.'],['away_pp_g','PP Góly'],['away_pk_o','PK Příl.'],['away_pk_ga','PK GA']].map(([k, label]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{label}</label>
                  <input type="number" className="form-input" value={form[k]} onChange={e => set(k, e.target.value)} min={0} placeholder="0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sekce 4: Brankáři ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-section-title">Brankáři</div>
        <div className="form-grid form-grid-2">
          {[
            { label: homeTeam?.code ?? 'Domácí', goalie: 'home_goalie', shots: 'home_goalie_shots', saves: 'home_goalie_saves', ga: 'home_goalie_ga', list: homeGoalies },
            { label: awayTeam?.code ?? 'Hosté', goalie: 'away_goalie', shots: 'away_goalie_shots', saves: 'away_goalie_saves', ga: 'away_goalie_ga', list: awayGoalies },
          ].map(({ label, goalie, shots, saves, ga, list }) => (
            <div key={goalie}>
              <div style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
              <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Brankář</label>
                  {list && list.length > 0 ? (
                    <select className="form-select" value={form[goalie]} onChange={e => set(goalie, e.target.value)}>
                      <option value="">— vyberte —</option>
                      {list.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" className="form-input" placeholder="Příjmení Jméno" value={form[goalie]} onChange={e => set(goalie, e.target.value)} />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Střely</label>
                  <input type="number" className="form-input" value={form[shots]} onChange={e => set(shots, e.target.value)} min={0} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Zákroky</label>
                  <input type="number" className="form-input" value={form[saves]} onChange={e => set(saves, e.target.value)} min={0} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">GA</label>
                  <input type="number" className="form-input" value={form[ga]} onChange={e => set(ga, e.target.value)} min={0} placeholder="0" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={mutation.isPending} style={{ minWidth: 160 }}>
          {mutation.isPending ? 'Ukládám...' : '✓ Uložit zápas'}
        </button>
        <button className="btn btn-ghost" onClick={() => setForm(INITIAL)}>Resetovat formulář</button>
        <button className="btn btn-ghost" onClick={() => navigate('/games')}>Zrušit</button>
      </div>
    </div>
  )
}
