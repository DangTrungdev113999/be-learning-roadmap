import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

// SPA redirect for GitHub Pages 404.html
const redirect = new URLSearchParams(window.location.search).get('redirect')
if (redirect) {
  window.history.replaceState(null, '', redirect)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
