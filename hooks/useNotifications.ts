'use client'
import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification } from '@/lib/types'

export function useNotifications(userId: string, supabase: SupabaseClient) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)

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
            setNotifications(prev => [payload.new, ...prev])
          })
          .subscribe()
      } catch {}
    }
    load()
    return () => { channel?.unsubscribe() }
  }, [userId])

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

  return { notifications, notifOpen, setNotifOpen, unreadCount, markAllRead, clearAll }
}
