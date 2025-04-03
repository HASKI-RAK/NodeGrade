// top level import
import '@/utils/css'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { setConfig } from '@/utils/config'

const container = document.getElementById('root')
const root = createRoot(container!)

import { App } from './pages/App'

fetch('/config/env.' + (process.env.NODE_ENV ?? 'development') + '.json')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Could not load config: ' + response.statusText)
    }
    return response.json()
  })
  .then((config) => {
    setConfig(config)

    root.render(<App />)
  })
  .catch((error) => {
    alert('Error loading config: ' + error)
  })

const updateSW = registerSW({
  onNeedRefresh() {
    alert('New version available! Refresh to update.')
  },
  onOfflineReady() {
    alert('App is ready for offline use.')
    console.log('App is ready for offline use.')
  },
  onRegisterError() {
    alert('Failed to register service worker :(')
  }
})
updateSW()
