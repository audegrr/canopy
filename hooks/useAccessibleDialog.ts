'use client'

import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useAccessibleDialog(
  open: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusTarget = initialFocusRef?.current || dialog?.querySelector<HTMLElement>(FOCUSABLE) || dialog
    requestAnimationFrame(() => focusTarget?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.offsetParent !== null)
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [initialFocusRef, open])

  return dialogRef
}
