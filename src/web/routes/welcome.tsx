import { createFileRoute } from '@tanstack/react-router'
import { OnboardingPage } from '../features/onboarding/OnboardingPage.tsx'

export const Route = createFileRoute('/welcome')({
  component: OnboardingPage,
})
