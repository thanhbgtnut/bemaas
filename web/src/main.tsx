import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { initAuth } from './auth'
import { api, type Me } from './api'
import App from './App'

const root = createRoot(document.getElementById('root')!)

initAuth()
  .then(() => api<Me>('/me'))
  .then((me) =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App me={me} />
        </BrowserRouter>
      </StrictMode>,
    ),
  )
  .catch((e: Error) => {
    root.render(
      <div className="m-8 rounded-md border border-bad/30 bg-bad-bg p-4 text-bad">
        Không đăng nhập được: {e.message}
      </div>,
    )
  })
