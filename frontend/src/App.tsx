import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import MediaDetail from './pages/MediaDetail'
import Torrents from './pages/Torrents'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/media/:id"   element={<MediaDetail />} />
          <Route path="/torrents"    element={<Torrents />} />
          <Route path="/settings"    element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
