import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OperatorErrorBoundary } from './components/OperatorErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OperatorErrorBoundary><App /></OperatorErrorBoundary>
  </StrictMode>,
)
