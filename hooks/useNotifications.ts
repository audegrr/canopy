'use client'
import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification } from '@/lib/types'

export function useNotifications(userId: string, supabase: SupabaseClient) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission)
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
              new Notification(notif.title, { body: notif.body ?? undefined, icon: '/icon.png' })
            }
          })
          .subscribe()
      } catch {}
    }
    load()
    return () => { channel?.unsubscribe() }
  }, [userId])

  async function requestBrowserPermission() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setBrowserPermission(result)
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

  return { notifications, notifOpen, setNotifOpen, unreadCount, markAllRead, clearAll, browserPermission, requestBrowserPermission }
}
