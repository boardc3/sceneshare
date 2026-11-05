import { useCallback, useEffect, useRef, useState } from 'react'

// Drag to reorder a list of items (the studio's photo rail). Pointer events, so it
// works with a mouse, a pen and a finger: with a mouse the drag starts after a few
// pixels of movement; on touch, after a short press (so the page still scrolls).
// The list rearranges live under the pointer; onCommit gets the new id order once,
// on release. Items carry data-sort-id; the container gets `ref`.
export function useSortable(ids, onCommit) {
  const [order, setOrder] = useState(ids)
  const [dragging, setDragging] = useState(null)
  const box = useRef(null)
  const st = useRef(null)
  const justDragged = useRef(false)

  useEffect(() => {
    if (!st.current) setOrder(ids)
  }, [ids])

  const slotAt = (x, y) => {
    const items = [...(box.current?.querySelectorAll('[data-sort-id]') || [])]
    let best = null
    let bestD = Infinity
    for (const el of items) {
      const r = el.getBoundingClientRect()
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      if (d < bestD) {
        bestD = d
        best = el.dataset.sortId
      }
    }
    return best
  }

  const move = useCallback((e) => {
    const s = st.current
    if (!s) return
    if (!s.active) {
      const far = Math.hypot(e.clientX - s.x, e.clientY - s.y)
      if (s.touch) {
        if (far > 10) return cancel() // a scroll, not a drag
        return
      }
      if (far < 6) return
      s.active = true
      setDragging(s.id)
    }
    e.preventDefault()
    const over = slotAt(e.clientX, e.clientY)
    if (!over || over === s.id) return
    setOrder((cur) => {
      const next = cur.filter((x) => x !== s.id)
      const at = next.indexOf(over)
      const from = cur.indexOf(s.id)
      const to = cur.indexOf(over)
      next.splice(to > from ? at + 1 : at, 0, s.id)
      return next
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const up = useCallback(() => {
    const s = st.current
    cancel()
    if (s?.active) {
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 50)
      setOrder((cur) => {
        if (cur.join() !== s.start.join()) onCommit(cur)
        return cur
      })
    }
  }, [onCommit]) // eslint-disable-line react-hooks/exhaustive-deps

  function cancel() {
    clearTimeout(st.current?.timer)
    st.current = null
    setDragging(null)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }

  const handleProps = (id) => ({
    'data-sort-id': id,
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      const touch = e.pointerType !== 'mouse'
      st.current = { id, x: e.clientX, y: e.clientY, touch, active: false, start: order }
      if (touch) {
        st.current.timer = setTimeout(() => {
          if (!st.current) return
          st.current.active = true
          st.current.touch = false // from here on, moves drag
          setDragging(id)
          navigator.vibrate?.(10)
        }, 260)
      }
      window.addEventListener('pointermove', move, { passive: false })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    // A drag ends with a click on the item: swallow it.
    onClickCapture: (e) => {
      if (justDragged.current) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    onContextMenu: (e) => st.current?.touch === false && e.preventDefault(),
  })

  // Keyboard and buttons: move one item one place.
  const nudge = (id, by) => {
    const cur = order
    const i = cur.indexOf(id)
    const j = i + by
    if (i < 0 || j < 0 || j >= cur.length) return
    const next = [...cur]
    next.splice(i, 1)
    next.splice(j, 0, id)
    setOrder(next)
    onCommit(next)
  }

  useEffect(() => () => cancel(), []) // eslint-disable-line react-hooks/exhaustive-deps
  return { order, dragging, box, handleProps, nudge }
}
