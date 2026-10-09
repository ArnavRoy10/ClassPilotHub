import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/supabase/user-context'
import { normalizePlan } from '@/lib/plans'
import { Logo } from '@/components/brand/logo'
import { OnboardingForm } from '@/components/app/onboarding-form'

// Shown to a signed-in person who has no organisation yet, e.g. someone who signed up with
// email confirmation turned on (no session at signup, so the workspace was never created).
export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (await getUserContext()) redirect('/dashboard')

  // The signup form stored these on the account, so finish setup automatically.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const organizationName = String(meta.organization_name ?? '').trim()
  const fullName = String(meta.full_name ?? '').trim()
  const planName = String(meta.plan ?? '').trim()

  if (organizationName && fullName) {
    const { error } = await supabase.rpc('create_organization_and_profile', {
      organization_name: organizationName,
      organization_type: normalizePlan(planName) === 'solo' ? 'solo_tutor' : 'coaching_center',
      organization_plan: planName || 'Starter',
      profile_full_name: fullName,
    })
    if (!error) redirect('/dashboard')
    console.error('Automatic workspace setup failed:', error.code, error.message)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-6 shadow-xl">
        <Logo />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Set up your workspace</h1>
          <p className="text-sm text-muted-foreground">One last step. Tell us about your center to start your 14-day free trial.</p>
        </div>
        <OnboardingForm defaultName={fullName} defaultOrganization={organizationName} defaultPlan={planName || 'Starter'} />
      </div>
    </div>
  )
}
