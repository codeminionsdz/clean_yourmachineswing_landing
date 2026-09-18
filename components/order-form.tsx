'use client'

import territories from '@/data/algeria-wilayas-communes.json'
import { FormEvent, useEffect, useState } from 'react'
import { trackMetaPurchase } from './meta-pixel'

type ConfirmedPurchase = { eventId: string; value: number; currency: string }
type OrderResponse = { order?: { order_number?: string; total_amount?: number | string; currency?: string }; created?: boolean; error?: string }

function readCookie(name: string) {
  const value = document.cookie.split('; ').find(cookie => cookie.startsWith(`${name}=`))
  if (!value) return undefined
  try { return decodeURIComponent(value.slice(name.length + 1)) } catch { return undefined }
}

function isValidFbc(value: string | undefined) { return Boolean(value && /^fb\.1\.\d+\.[^\s]+$/.test(value)) }
function isValidFbp(value: string | undefined) { return Boolean(value && /^fb\.1\.\d+\.\d+$/.test(value)) }

function readMetaAttribution() {
  const params = new URLSearchParams(window.location.search)
  const fbclid = params.get('fbclid') || window.sessionStorage.getItem('meta_fbclid') || undefined
  if (params.get('fbclid')) window.sessionStorage.setItem('meta_fbclid', params.get('fbclid') as string)
  let fbc = readCookie('_fbc')
  if (!isValidFbc(fbc) && fbclid) {
    fbc = `fb.1.${Date.now()}.${fbclid}`
    document.cookie = `_fbc=${encodeURIComponent(fbc)}; Max-Age=7776000; Path=/; SameSite=Lax`
  }
  const fbp = readCookie('_fbp')
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
    fbclid,
    event_source_url: window.location.href,
    fbp: isValidFbp(fbp) ? fbp : undefined,
    fbc: isValidFbc(fbc) ? fbc : undefined,
  }
}

export function OrderForm() {
  const [values, setValues] = useState({ fullName: '', phone: '', wilaya: '', commune: '', address: '', notes: '' })
  const [submissionId, setSubmissionId] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [confirmedPurchase, setConfirmedPurchase] = useState<ConfirmedPurchase | null>(null)
  const selectedWilaya = territories.find(wilaya => String(wilaya.code) === values.wilaya)
  useEffect(() => { readMetaAttribution() }, [])
  useEffect(() => {
    if (!Object.values(values).some(value => value.trim())) return
    if (!submissionId) { setSubmissionId(crypto.randomUUID()); return }
    const timer = window.setTimeout(() => {
      const selectedCommune = selectedWilaya?.communes.find(commune => commune.ascii === values.commune)
      void fetch('/api/abandoned-orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: submissionId, fullName: values.fullName, phone: values.phone, wilaya: selectedWilaya?.ascii ?? values.wilaya, commune: selectedCommune?.ascii ?? values.commune, address: values.address, notes: values.notes }) })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [values, submissionId, selectedWilaya])
  useEffect(() => {
    if (state === 'success' && confirmedPurchase) trackMetaPurchase(confirmedPurchase.value, confirmedPurchase.currency, confirmedPurchase.eventId)
  }, [state, confirmedPurchase])
  function update(key: keyof typeof values, value: string) { if (!submissionId) setSubmissionId(crypto.randomUUID()); setValues(current => ({ ...current, [key]: value })); if (state === 'error') { setState('idle'); setMessage('') } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (state === 'submitting') return
    const requiredFields: [keyof typeof values, string][] = [['fullName', 'الاسم الكامل'], ['phone', 'رقم الهاتف'], ['wilaya', 'الولاية'], ['commune', 'البلدية'], ['address', 'العنوان']]
    const missing = requiredFields.find(([key]) => !values[key].trim())
    if (missing) { setState('error'); setMessage(`الرجاء إدخال ${missing[1]}.`); return }
    const normalizedPhone = values.phone.replace(/\s+/g, '')
    if (!/^(?:0[567]\d{8}|\+213[567]\d{8})$/.test(normalizedPhone)) { setState('error'); setMessage('رقم الهاتف غير صحيح. أدخل رقمًا جزائريًا صالحًا.'); return }
    const id = submissionId || crypto.randomUUID(); setSubmissionId(id); setState('submitting'); setMessage('')
    try {
      const attribution = readMetaAttribution()
      const selectedCommune = selectedWilaya?.communes.find(commune => commune.ascii === values.commune)
      if (!selectedWilaya || !selectedCommune) throw new Error('invalid_delivery_area')
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productSlug: 'acme-model-320', quantity: 1, submissionId: id, fullName: values.fullName, phone: values.phone, wilaya: selectedWilaya.ascii, commune: selectedCommune.ascii, address: values.address, notes: values.notes, attribution }) })
      const result = await response.json() as OrderResponse
      if (!response.ok) throw new Error(result.error || 'order_failed')
      if (result.created !== true) {
        setOrderNumber(result.order?.order_number || '')
        setState('success')
        return
      }
      const eventId = result.order?.order_number
      const value = Number(result.order?.total_amount)
      const currency = result.order?.currency || 'DZD'
      if (!eventId || !Number.isFinite(value) || value <= 0 || currency !== 'DZD') throw new Error('invalid_confirmed_order')
      setOrderNumber(eventId); setConfirmedPurchase({ eventId, value, currency }); setState('success')
    } catch { setState('error'); setMessage('تعذّر تسجيل طلبك. حاول مرة أخرى.') }
  }
  if (state === 'success') return <section id="order-form" className="order-section"><div className="order-success" role="status"><p className="eyebrow">تم استلام طلبك</p><h2>تم تسجيل طلبك بنجاح</h2><p>سنتواصل معك لتأكيد الطلب.</p>{orderNumber && <p className="order-reference">رقم الطلب: <strong>{orderNumber}</strong></p>}<p>الدفع عند الاستلام</p></div></section>
  return <section id="order-form" className="order-section" dir="rtl"><div className="order-intro"><p className="eyebrow">اطلب الآن</p><h2>خلي طلبك يوصل لباب دارك.</h2><p>عمر المعلومات التالية، ونتواصلو معاك باش نأكدو الطلب.</p></div><form className="order-form" onSubmit={submit} noValidate><div className="order-summary"><div><span>المنتج</span><strong>ACME Model 320</strong></div><div><span>السعر</span><strong>44,000 دج</strong></div><div><span>طريقة الدفع</span><strong>الدفع عند الاستلام</strong></div></div><label>الاسم الكامل<input required value={values.fullName} onChange={event => update('fullName', event.target.value)} autoComplete="name" /></label><label>رقم الهاتف<input required type="tel" inputMode="tel" placeholder="05 / 06 / 07 xx xx xx xx" value={values.phone} onChange={event => update('phone', event.target.value)} autoComplete="tel" /></label><div className="order-fields"><label>الولاية<select required value={values.wilaya} onChange={event => setValues(current => ({ ...current, wilaya: event.target.value, commune: '' }))}><option value="">اختر الولاية</option>{territories.map(wilaya => <option key={wilaya.code} value={wilaya.code}>{wilaya.arabic} - {wilaya.ascii}</option>)}</select></label><label>البلدية<select required value={values.commune} disabled={!selectedWilaya} onChange={event => update('commune', event.target.value)}><option value="">{selectedWilaya ? 'اختر البلدية' : 'اختر الولاية أولا'}</option>{selectedWilaya?.communes.map(commune => <option key={commune.ascii} value={commune.ascii}>{commune.arabic} - {commune.ascii}</option>)}</select></label></div><label>العنوان<input required value={values.address} onChange={event => update('address', event.target.value)} autoComplete="street-address" /></label><label>ملاحظة <span className="optional-label">(اختيارية)</span><textarea maxLength={1000} value={values.notes} onChange={event => update('notes', event.target.value)} placeholder="مثال: اتصل بي قبل التوصيل" /></label>{state === 'error' && <p className="order-error" role="alert">{message}</p>}<button className="cta order-submit" type="submit" disabled={state === 'submitting'}>{state === 'submitting' ? 'جار تسجيل الطلب…' : 'تأكيد الطلب'}</button></form></section>
}
