import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getGames, getTeams } from '../services/api'
import { PlusCircle, TrendingUp } from 'lucide-react'

function FormDots({ results = [] }) {
  return (
    <div className="form-dots">
      {results.map((r, i) => (
        <div key={i} className={`form-dot dot-${r}`} title={r} />
      ))}
    </div>
  )
}

function ResultBadge({ result }) {
  if (!result) return <span className="text-muted">—</span>
  return <span className={`badge badge-${result}`}>{result}</span>
}

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: gamesData, isLoading: gamesLoading } = useQuery({
    queryKey: ['games', { limit: 10 }],
    queryFn: () => getGames({ limit: 10, season: '25/26' }),
  })

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
  })

  const games = gamesData?.games ?? []
  const total = gamesData?.total ?? 0

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Přehled sezóny 2024/25 · Česká extraliga</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/games/new')}>
          <PlusCircle size={14} /> Zadat zápas
        </button>
      </div>

      {/* Stats tiles */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-label">Zápasů v DB</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">sezóna 25/26</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Týmů</div>
          <div className="stat-value">{teams?.length ?? '—'}</div>
          <div className="stat-sub">ELH 2024/25</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Přesnost modelu</div>
          <div className="stat-value">—</div>
          <div className="stat-sub">po importu dat</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Poslední import</div>
          <div className="stat-value" style={{ fontSize: 20 }}>Excel</div>
          <div className="stat-sub up">data načtena</div>
        </div>
      </div>

      <div className="two-col">
        {/* Recent games */}
        <div className="card">
          <div className="card-title">Poslední zápasy</div>
          {gamesLoading ? (
            <div className="spinner" />
          ) : games.length === 0 ? (
            <div className="empty-state">
              Žádné zápasy v databázi.<br />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/games/new')}>
                Zadat první zápas
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Domácí</th>
                    <th style={{ textAlign: 'center' }}>Skóre</th>
                    <th>Hosté</th>
                    <th>Výsl.</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map(g => (
                    <tr key={g.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {g.date ? new Date(g.date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <span className="team-code">{g.home_team}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {g.goals_home != null ? (
                          <div className="score-display" style={{ fontSize: 16, justifyContent: 'center' }}>
                            <span>{g.goals_home}</span>
                            <span className="score-sep">:</span>
                            <span>{g.goals_away}</span>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <span className="team-code">{g.away_team}</span>
                      </td>
                      <td>
                        <ResultBadge result={g.result_home} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {games.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate('/games')}>
                Všechny zápasy →
              </button>
            </div>
          )}
        </div>

        {/* Teams overview */}
        <div className="card">
          <div className="card-title">Týmy v databázi</div>
          {!teams ? (
            <div className="spinner" />
          ) : teams.length === 0 ? (
            <div className="empty-state">Žádné týmy — spusťte import z Excelu</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kód</th>
                    <th>Název</th>
                    <th>Liga</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(t => (
                    <tr key={t.id}>
                      <td><span className="team-code">{t.code}</span></td>
                      <td>{t.name || <span className="text-muted">—</span>}</td>
                      <td className="muted">{t.league}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate('/predictions')}>
              <TrendingUp size={13} /> Spustit predikci →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
