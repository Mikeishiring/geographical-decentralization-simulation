import { lazy } from 'react'

export default lazy(() => import.meta.env.VITE_DEMO_MODE === 'true'
  ? import('./DemoApp.tsx')
  : import('./App.tsx'))
