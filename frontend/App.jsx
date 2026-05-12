import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Games from './pages/Games'
import GameEntry from './pages/GameEntry'
import Predictions from './pages/Predictions'
import Teams from './pages/Teams'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="games"       element={<Games />} />
        <Route path="games/new"   element={<GameEntry />} />
        <Route path="predictions" element={<Predictions />} />
        <Route path="teams"       element={<Teams />} />
      </Route>
    </Routes>
  )
}
