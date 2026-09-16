export type OrderInput = {
  submissionId: string; productSlug: string; fullName: string; phone: string; wilaya: string; commune: string; address: string; quantity: number; notes?: string
  attribution?: Record<string, string | undefined>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const phone = /^(?:0(5|6|7)\d{8}|\+213(5|6|7)\d{8})$/
export function validateOrderInput(value: unknown): OrderInput {
  if (!value || typeof value !== 'object') throw new Error('invalid_form_data')
  const input = value as Record<string, unknown>
  const text = (key: string, max: number, required = true) => {
    const v = typeof input[key] === 'string' ? input[key].trim() : ''
    if (required && (!v || v.length > max)) throw new Error('invalid_form_data')
    return v
  }
  const submissionId = text('submissionId', 36)
  const rawPhone = text('phone', 16).replace(/\s+/g, '')
  const quantity = input.quantity
  if (!uuid.test(submissionId) || !phone.test(rawPhone) || !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99) throw new Error('invalid_order_details')
  const attribution = typeof input.attribution === 'object' && input.attribution ? input.attribution as Record<string, string | undefined> : {}
  return { submissionId, productSlug: text('productSlug', 120), fullName: text('fullName', 120), phone: rawPhone.replace(/^0/, '+213'), wilaya: text('wilaya', 80), commune: text('commune', 120), address: text('address', 300), quantity: quantity as number, notes: text('notes', 1000, false) || undefined, attribution }
}
