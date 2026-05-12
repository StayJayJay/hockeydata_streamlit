import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getGames, getTeams, getSeasons } from '../services/api'
import { PlusCircle, Filter } from 'lucide-react'

function ResultBadge({ result }) {
  if (!result) return <span className="text-muted" style={{ fontSize: 12 }}>—</span>
  return <span className={`badge badge-${result}`}>{result}</span>
}

const OT_LABELS = { 0: '', 1: 'OT', 2: SO }

export default function Games() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ season: '25/26', team: '', game_type: '', limit: 50, offset: 0 })

  const { data, isLoading } = useQuery({
    queryKey: ['games', filters],
    queryFn: () => getGames(Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== ''))),
  })

  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  const { data: seasons } = useQuery({ queryKey: ['seasons'], queryFn: getSeasons })

  const games = data?.games ?? []
  const total = data?.total ?? 0

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, offset: 0 }))
  const pages = Math.ceil(total / filters.limit)
  const page = Math.floor(filters.offset / filters.limit)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Zápasy</h1>
          <p className="page-subtitle">{total} záznamů v databázi</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/games/new')}>
          <PlusCircle size={14} /> Zadat zápas
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 120 }}>
            <label className="form-label">Sezóna</label>
            <select className="form-select" value={filters.season} onChange={e => set('season', e.target.value)}>
              <option value="">Všechny</option>
              {seasons?.map(s => <option key={s.id} value={s.code}>{s.code}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label className="form-label">Tým</label>
            <select className="form-select" value={filters.team} onChange={e => set('team', e.target.value)}>
              <option value="">Všechny týmy</option>
              {teams?.map(t => <option key={t.id} value={t.code}>{t.code} – {t.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 120 }}>
            <label className="form-label">Typ</label>
            <select className="form-select" value={filters.game_type} onChange={e => set('game_type', e.target.value)}>
              <option value="">Vše</option>
              <option value="RS">Základní část</option>
              <option value="PO">Playoff</option>
            </select>
          </div>
          <button className="btn btn-ghost" onClick={() => setFilters({ season: '25/26', team: '', game_type: '', limit: 50, offset: 0 })}>
            Resetovat
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {isLoading ? (
            <div className="spinner" />
          ) : games.length === 0 ? (
            <div className="empty-state">
              Žádné zápasy nenalezeny.<br />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/games/new')}>
                <PlusCircle size={13} /> Zadat první zápas
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Kolo</th>
                  <th>Datum</th>
                  <th>Typ</th>
                  <th>Domácí</th>
                  <th style={{ textAlign: 'center' }}>Skóre</th>
                  <th>Hosté</th>
                  <th style={{ textAlign: 'center' }}>xG dom.</th>
                  <th style={{ textAlign: 'center' }}>xG host.</th>
                  <th>OT/SO</th>
                  <th>Výsl.</th>
                </tr>
              </thead>
              <tbody>
                {games.map(g => (
                  <tr key={g.id} style={{ cursor: 'pointer' }}>
                    <td className="num muted">{g.round ?? '—'}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {g.date ? new Date(g.date).toLocaleDateString('cs-CZ') : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.5px' }}>
                        {g.game_type}
                      </span>
                    </td>
                    <td><span className="team-code">{g.home_team}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      {g.goals_home != null ? (
                        <span className="mono">
                          {g.goals_home} <span style={{ color: 'var(--text-3)' }}>:</span> {g.goals_away}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td><span className="team-code">{g.away_team}</span></td>
                    <td className="num">
                      {g.xg_home != null ? (
                        <span style={{ color: 'var(--accent-2)' }}>{g.xg_home.toFixed(2)}</span>
                      ) : <span className="text-muted" style={{ fontSize: 12 }}>—</span>}
                    </td>
                    <td className="num">
                      {g.xg_away != null ? (
                        <span style={{ color: 'var(--danger)' }}>{g.xg_away.toFixed(2)}</span>
                      ) : <span className="text-muted" style={{ fontSize: 12 }}>—</span>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {g.ot_so === 1 ? 'OT' : g.ot_so === 2 ? 'SO' : '—'}
                    </td>
                    <td><ResultBadge result={g.result_home} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
            <button
              className="btn btn-ghost"
              disabled={page === 0}
              onClick={() => setFilters(f => ({ ...f, offset: f.offset - f.limit }))}
            >← Předchozí</button>
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Strana {page + 1} / {pages}</span>
            <button
              className="btn btn-ghost"
              disabled={page >= pages - 1}
              onClick={() => setFilters(f => ({ ...f, offset: f.offset + f.limit }))}
            >Další →</button>
          </div>
        )}
      </div>
    </div>
  )
}
