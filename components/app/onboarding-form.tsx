'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { createClient } from '@/lib/supabase/client'
import { PLAN_ORDER, PLANS, formatINR, normalizePlan } from '@/lib/plans'

export function OnboardingForm({ defaultName, defaultOrganization, defaultPlan }: { defaultName: string; defaultOrganization: string; defaultPlan: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState(normalizePlan(defaultPlan) ?? 'starter')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const { error } = await createClient().rpc('create_organization_and_profile', {
      organization_name: String(form.get('center') ?? '').trim(),
      organization_type: plan === 'solo' ? 'solo_tutor' : 'coaching_center',
      organization_plan: PLANS[plan].name,
      profile_full_name: String(form.get('name') ?? '').trim(),
    })
    if (error) {
      setLoading(false)
      toast.error('Unable to set up your workspace. Please try again.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="center">Center or tutoring name</FieldLabel><Input id="center" name="center" defaultValue={defaultOrganization} required /></Field>
        <Field><FieldLabel htmlFor="name">Your name</FieldLabel><Input id="name" name="name" defaultValue={defaultName} autoComplete="name" required /></Field>
        <Field>
          <FieldLabel htmlFor="plan">Plan (free for 14 days)</FieldLabel>
          <select id="plan" value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className="border-input bg-background text-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none">
            {PLAN_ORDER.map((id) => <option key={id} value={id}>{PLANS[id].name} — {formatINR(PLANS[id].monthly)}/month</option>)}
          </select>
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Setting up…' : 'Start free trial'}</Button>
      </FieldGroup>
    </form>
  )
}
