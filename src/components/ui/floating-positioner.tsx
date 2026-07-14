"use client"

import type { HTMLProps } from "@base-ui/react/types"

const TRANSLATE_PATTERN =
  /^translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\s*\)$/

type FloatingPositionerState = {
  align: string
  side: string
}

function getRootZoom() {
  if (typeof window === "undefined") return 1

  const zoom = Number.parseFloat(
    window.getComputedStyle(document.documentElement).zoom || "1"
  )

  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

/**
 * Base UI positions body-portaled overlays from already-zoomed client rects.
 * Correct only the coordinates so the popup keeps the app's visual density.
 */
function getSizeCorrection(
  state: FloatingPositionerState,
  rootZoom: number
) {
  const full = ((1 - rootZoom) / rootZoom) * 100
  const aligned = state.align === "end" ? full : state.align === "center" ? full / 2 : 0
  const verticalSide = state.side === "top" || state.side === "bottom"
  let x = verticalSide ? aligned : 0
  let y = verticalSide ? 0 : aligned

  if (state.side === "top") y += full
  if (state.side === "left" || state.side === "inline-start") x += full

  return x || y ? `${x}% ${y}%` : undefined
}

function renderZoomCorrectedPositioner(
  props: HTMLProps<HTMLDivElement>,
  state: FloatingPositionerState
) {
  const transform = props.style?.transform
  const rootZoom = getRootZoom()
  const match =
    typeof transform === "string" ? transform.match(TRANSLATE_PATTERN) : null

  if (!match || Math.abs(rootZoom - 1) < 0.001) {
    return <div {...props} />
  }

  const x = Number.parseFloat(match[1]) / rootZoom
  const y = Number.parseFloat(match[2]) / rootZoom
  const translate = getSizeCorrection(state, rootZoom)

  return (
    <div
      {...props}
      style={{
        ...props.style,
        transform: `translate(${x}px, ${y}px)`,
        translate,
      }}
    />
  )
}

export { renderZoomCorrectedPositioner }
