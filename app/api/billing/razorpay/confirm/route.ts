import { NextResponse } from 'next/server'
import { getBillingContext } from '@/lib/billing'
import { razorpay } from '@/lib/razorpay'

// Called by the browser after the customer authorises a new subscription. When that
// subscription replaces an older one (plan change), the older one is stopped at the end
// of its paid period so the customer is never billed twice.
export async function POST(request: Request) {
  const context = await getBillingContext()
  if (!context || context.profile.role !== 'owner') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as { subscriptionId?: string } | null
  if (!razorpay || !body?.subscriptionId) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  try {
    const subscription = await razorpay.subscriptions.fetch(body.subscriptionId)
    const notes = (subscription.notes ?? {}) as unknown as Record<string, string>
    if (notes.organization_id !== context.organization.id) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })

    if (notes.replaces && ['authenticated', 'active'].includes(String(subscription.status))) {
      await razorpay.subscriptions.cancel(notes.replaces, 1).catch((error: unknown) => console.error('Unable to stop replaced subscription:', error))
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Razorpay confirm failed:', error)
    return NextResponse.json({ error: 'Unable to confirm subscription.' }, { status: 502 })
  }
}
