import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// ── Teams ──────────────────────────────────────────────
export const getTeams = () => api.get('/teams/').then(r => r.data)
export const getTeam  = (code) => api.get(`/teams/${code}`).then(r => r.data)
export const getTeamGoalies = (code) => api.get(`/teams/${code}/goalies`).then(r => r.data)

// ── Games ──────────────────────────────────────────────
export const getGames = (params = {}) =>
  api.get('/games/', { params }).then(r => r.data)

export const getGame = (id) => api.get(`/games/${id}`).then(r => r.data)

export const createGame = (payload) =>
  api.post('/games/', payload).then(r => r.data)

export const deleteGame = (id) =>
  api.delete(`/games/${id}`).then(r => r.data)

// ── Seasons ────────────────────────────────────────────
export const getSeasons = () => api.get('/seasons').then(r => r.data)

// ── Stats & Predictions ────────────────────────────────
export const getTeamStats = (season, team, game_type = 'RS') =>
  api.get(`/predictions/team-stats/${season}/${team}`, { params: { game_type } }).then(r => r.data)

export const getTeamForm = (season, team, last_n = 5) =>
  api.get(`/predictions/team-form/${season}/${team}`, { params: { last_n } }).then(r => r.data)

export const getGoalieStats = (season, goalie, game_type = 'RS') =>
  api.get(`/predictions/goalie-stats/${season}/${goalie}`, { params: { game_type } }).then(r => r.data)

export const predictMatch = (payload) =>
  api.post('/predictions/match', payload).then(r => r.data)
