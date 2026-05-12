import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, PlusCircle,
  TrendingUp, Users, Layers
} from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="logo">Extraliga<span>HUB</span></div>
        <div className="topbar-right">
          <span className="season-badge">2024 / 25</span>
          <button className="btn btn-primary" onClick={() => navigate('/games/new')}>
            <PlusCircle size={14} /> Zadat zápas
          </button>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <nav className="sidebar">
        <div className="nav-section">
          <div className="nav-section-label">Přehled</div>
          <NavLink to="/dashboard" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <LayoutDashboard size={15} /> Dashboard
          </NavLink>
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label">Data</div>
          <NavLink to="/games" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <CalendarDays size={15} /> Zápasy
          </NavLink>
          <NavLink to="/games/new" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <PlusCircle size={15} /> Zadat zápas
          </NavLink>
          <NavLink to="/teams" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <Users size={15} /> Týmy
          </NavLink>
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label">Analytika</div>
          <NavLink to="/predictions" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <TrendingUp size={15} /> Predikce
          </NavLink>
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label" style={{marginTop: 4}}>Sezóna</div>
          <div style={{padding: '4px 8px'}}>
            <select className="form-select" style={{fontSize: 12}}>
              <option>2024/25</option>
              <option>2023/24</option>
            </select>
          </div>
        </div>
      </nav>

      {/* ── Page Content ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
