import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Link do comprovante de garantia enviado ao cliente por WhatsApp: página pública, sem login.
// Cada tela baixa só o próprio código: o celular do cliente não carrega o sistema inteiro.
const App = lazy(() => import('./App.tsx'))
const WarrantySignPage = lazy(() => import('./pages/public/WarrantySignPage'))
const warrantyToken = window.location.pathname.match(/^\/garantia\/([A-Za-z0-9_-]+)\/?$/)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {warrantyToken ? <WarrantySignPage token={warrantyToken} /> : <App />}
    </Suspense>
  </StrictMode>,
)
