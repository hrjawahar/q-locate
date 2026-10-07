import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './public/Layout'
import Home from './public/Home'
import List from './public/List'
import PlacePage from './public/Place'
import { Saved, Community, About } from './public/Pages'
import Movies from './public/Movies'
import Books from './public/Books'
import Festivals from './public/Festivals'
const AdminApp = lazy(() => import('./admin/AdminApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<List key="v" kind="vacation" />} />
          <Route path="/darshan" element={<List key="s" kind="spiritual" />} />
          <Route path="/v/:slug" element={<PlacePage />} />
          <Route path="/s/:slug" element={<PlacePage />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/books" element={<Books />} />
          <Route path="/festivals" element={<Festivals />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/community" element={<Community />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
