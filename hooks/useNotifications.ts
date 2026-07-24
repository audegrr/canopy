'use client'
import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification } from '@/lib/types'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await syncSubscription(existing)
    return
  }
  if (!VAPID_PUBLIC_KEY) return
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  await syncSubscription(sub)
}

async function syncSubscription(sub: PushSubscription) {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  const endpoint = sub?.endpoint
  if (sub) await sub.unsubscribe()
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

export function useNotifications(userId: string, supabase: SupabaseClient) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default')
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setBrowserPermission(Notification.permission)
    // Check if already subscribed
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub))
      )
    }
  }, [])

  useEffect(() => {
    let channel: any
    async function load() {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30)
        if (data) setNotifications(data)
        channel = supabase
          .channel('notifs_' + userId)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload: any) => {
            const notif: Notification = payload.new
            setNotifications(prev => [notif, ...prev])
            if (
              typeof window !== 'undefined' &&
              'Notification' in window &&
              Notification.permission === 'granted' &&
              !document.hasFocus()
            ) {
              new Notification(notif.title, { body: notif.body ?? undefined, icon: '/canopy_favicon_no_bg.ico' })
            }
          })
          .subscribe()
      } catch {}
    }
    load()
    return () => { channel?.unsubscribe() }
  }, [userId, supabase])

  async function requestBrowserPermission() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setBrowserPermission(result)
    if (result === 'granted') {
      await subscribeToPush()
      setPushEnabled(true)
    }
  }

  async function togglePush() {
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
    } else {
      if (browserPermission !== 'granted') {
        const result = await Notification.requestPermission()
        setBrowserPermission(result)
        if (result !== 'granted') return
      }
      await subscribeToPush()
      setPushEnabled(true)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  async function markAllRead() {
    try {
      await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
      setNotifications(ns => ns.map(n => ({ ...n, read: true })))
    } catch {}
  }

  async function clearAll() {
    try {
      await supabase.from('notifications').delete().eq('user_id', userId)
      setNotifications([])
    } catch {}
  }

  async function deleteNotification(id: string) {
    setNotifications(ns => ns.filter(n => n.id !== id))
    try {
      await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId)
    } catch {}
  }

  return { notifications, notifOpen, setNotifOpen, unreadCount, markAllRead, clearAll, deleteNotification, browserPermission, requestBrowserPermission, pushEnabled, togglePush }
}
