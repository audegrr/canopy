'use client'

import { useReportWebVitals } from 'next/web-vitals'

const reportMetric: Parameters<typeof useReportWebVitals>[0] = metric => {
  // Sample one in ten sessions to preserve free runtime-log quotas.
  const sampleKey = 'canopy:vitals-sample'
  let sampled = sessionStorage.getItem(sampleKey)
  if (sampled === null) {
    sampled = Math.random() < 0.1 ? '1' : '0'
    sessionStorage.setItem(sampleKey, sampled)
  }
  if (sampled !== '1') return
  const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, navigationType: metric.navigationType, path: location.pathname })
  navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))
}

export default function WebVitals() {
  useReportWebVitals(reportMetric)
  return null
}
