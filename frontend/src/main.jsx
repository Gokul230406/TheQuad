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
          background: '#1e1e2e',
          color: '#cdd6f4',
          border: '1px solid #313244',
          borderRadius: '12px',
        },
        success: { iconTheme: { primary: '#a6e3a1', secondary: '#1e1e2e' } },
        error: { iconTheme: { primary: '#f38ba8', secondary: '#1e1e2e' } },
      }}
    />
  </React.StrictMode>
)
