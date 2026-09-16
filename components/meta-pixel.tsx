'use client'

import Script from 'next/script'

type MetaEvent = { name: 'InitiateCheckout' | 'Purchase'; parameters: Record<string, unknown>; eventId?: string }

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: Window['fbq']
    __metaPixelInitialized?: boolean
    __metaPixelId?: string
    __metaEventQueue?: MetaEvent[]
    __metaTrackedEvents?: Set<string>
    __metaEventIds?: Record<string, string>
  }
}

export function MetaPixel({ pixelId }: { pixelId?: string | null }) {
  if (!pixelId) return null
  const pixelIdLiteral = JSON.stringify(pixelId)
  const pageViewParameters = JSON.stringify({ content_name: 'ACME model 320', content_type: 'product' })
  return <Script id="meta-pixel" strategy="afterInteractive">{`
(function(w,d,s,u,id){
  if (w.__metaPixelInitialized && w.__metaPixelId === id) return;
  if (!w.fbq) {
    var n = function(){ n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    w.fbq = n;
    w._fbq = n;
    var t = d.createElement(s); t.async = true; t.src = u;
    var first = d.getElementsByTagName(s)[0]; first.parentNode.insertBefore(t, first);
  }
  w.fbq('init', id);
  w.__metaPixelId = id;
  w.__metaPixelInitialized = true;
  w.fbq('track', 'PageView');
  w.fbq('track', 'ViewContent', ${pageViewParameters});
  var queued = w.__metaEventQueue || [];
  w.__metaEventQueue = [];
  queued.forEach(function(event){
    w.fbq('track', event.name, event.parameters, event.eventId ? { eventID: event.eventId } : undefined);
  });
})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js',${pixelIdLiteral});
`}</Script>
}

function eventKey(name: MetaEvent['name'], eventId?: string) {
  return eventId ? `${name}:${eventId}` : name
}

function dispatchMetaEvent(event: MetaEvent) {
  if (!window.fbq) return
  window.fbq('track', event.name, event.parameters, event.eventId ? { eventID: event.eventId } : undefined)
}

export function getMetaEventId(name: MetaEvent['name']) {
  if (typeof window === 'undefined') return undefined
  window.__metaEventIds ??= {}
  window.__metaEventIds[name] ??= crypto.randomUUID()
  return window.__metaEventIds[name]
}

export function trackMetaEvent(name: MetaEvent['name'], parameters: Record<string, unknown> = {}, eventId?: string) {
  if (typeof window === 'undefined') return
  window.__metaTrackedEvents ??= new Set<string>()
  const key = eventKey(name, eventId)
  if (window.__metaTrackedEvents.has(key)) return
  window.__metaTrackedEvents.add(key)
  const event: MetaEvent = { name, parameters, eventId }
  if (!window.__metaPixelInitialized || !window.fbq) {
    window.__metaEventQueue ??= []
    window.__metaEventQueue.push(event)
    return
  }
  dispatchMetaEvent(event)
}

export function trackMetaPurchase(value: number, currency: string, eventId: string) {
  if (!Number.isFinite(value) || value <= 0 || !eventId) return
  trackMetaEvent('Purchase', { value, currency }, eventId)
}
