import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--panel)',
          color: 'var(--text)',
          border: '1px solid var(--line-strong)',
          borderRadius: '12px',
        },
        success: { iconTheme: { primary: 'var(--ok)', secondary: 'var(--panel)' } },
        error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--panel)' } },
      }}
    />
  </React.StrictMode>
)
