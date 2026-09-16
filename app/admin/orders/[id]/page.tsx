import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { requireAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { StatusForm } from '@/components/status-form'
import { ShipOrderButton } from '@/components/ship-order-button'
import { OrderDetailsForm } from '@/components/order-details-form'

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const { data: order, error } = await getSupabaseAdmin().from('orders').select('*, customers(full_name,phone), products(name,brand,manufacturer,model)').eq('id', id).maybeSingle()
  if (error || !order) notFound()
  const customer = order.customers as { full_name: string; phone: string } | null
  const product = order.products as { name: string; brand: string; manufacturer: string; model: string } | null
  return <main className="admin-content" dir="ltr"><div className="admin-toolbar"><h2>Order {order.order_number}</h2><StatusForm orderId={order.id} current={order.status}/>{!order.tracking_reference && <ShipOrderButton orderId={order.id}/>}</div><OrderDetailsForm orderId={order.id} fullName={customer?.full_name ?? ''} phone={customer?.phone ?? ''} wilaya={order.wilaya} commune={order.commune} address={order.address} customerNotes={order.notes ?? ''} sellerNotes={order.seller_notes ?? ''}/><div className="admin-detail"><Info title="Order information" items={[["Order number", order.order_number], ["Status", order.status], ["Created", new Date(order.created_at).toLocaleString()], ["Updated", new Date(order.updated_at).toLocaleString()]]}/><Info title="Customer" items={[["Full name", customer?.full_name], ["Phone", customer?.phone]]}/><Info title="Delivery" items={[["Wilaya", order.wilaya], ["Commune", order.commune], ["Address", order.address]]}/><Info title="Product" items={[["Product", product?.name], ["Quantity", order.quantity], ["Unit price", `${Number(order.unit_price).toLocaleString()} ${order.currency}`], ["Total", `${Number(order.total_amount).toLocaleString()} ${order.currency}`]]}/><Info title="Payment" items={[["Method", 'Cash on delivery']]}/><Info title="Marketing attribution" items={[["utm_source", order.utm_source], ["utm_medium", order.utm_medium], ["utm_campaign", order.utm_campaign], ["utm_content", order.utm_content], ["utm_term", order.utm_term], ["fbclid", order.fbclid]]}/><Info title="Customer note" items={[["Note", order.notes]]}/><Info title="Seller note" items={[["Note", order.seller_notes]]}/><Info title="Shipping" items={[["Provider", order.shipping_provider], ["Tracking", order.tracking_reference], ["Status", order.shipping_status], ["Shipped", order.shipped_at && new Date(order.shipped_at).toLocaleString()], ["Delivered", order.delivered_at && new Date(order.delivered_at).toLocaleString()], ["Returned", order.returned_at && new Date(order.returned_at).toLocaleString()]]}/></div></main>
}
function Info({ title, items }: { title: string; items: [string, unknown][] }) { const visible = items.filter(([, value]) => value !== null && value !== undefined && value !== ''); return <section><h2>{title}</h2>{visible.length === 0 ? <p className="admin-empty">No information available.</p> : <dl>{visible.map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{String(value)}</dd></Fragment>)}</dl>}</section> }
