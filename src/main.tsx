import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/roboto/wght.css'
import '@fontsource-variable/noto-sans-kr'
import '@fontsource-variable/noto-serif-kr'
import App from './App'
import './styles/base.css'
import './styles/timer.css'
import './styles/screens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
