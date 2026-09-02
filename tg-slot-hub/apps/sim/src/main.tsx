import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/app.css'

const container = document.getElementById('root')
if (container === null) throw new Error('#root를 찾지 못했다')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
