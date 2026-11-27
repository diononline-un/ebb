// Paddle.js loads on the billing page only (E8-P5): the checkout is an overlay from Paddle's CDN, so
// its weight never enters the bundle. A later CSP has to allow `cdn.paddle.com` and Paddle's frames
// (sandbox and live customer portal); until then this script tag is the one outside request.

const SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js'

/** The slice of Paddle.js this page uses. */
type PaddleGlobal = {
  Environment: { set(environment: 'sandbox' | 'production'): void }
  Initialize(options: { token: string }): void
  Checkout: {
    open(options: {
      items: { priceId: string; quantity: number }[]
      customer: { email: string }
      customData: Record<string, string>
    }): void
  }
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal
  }
}

// One script tag per page: a second click reuses the same load instead of adding another tag.
let loading: Promise<PaddleGlobal> | null = null

function load(): Promise<PaddleGlobal> {
  if (window.Paddle) return Promise.resolve(window.Paddle)
  loading ??= new Promise<PaddleGlobal>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      if (window.Paddle) resolve(window.Paddle)
      else reject(new Error('paddle.js loaded without leaving Paddle behind'))
    }
    // Forgetting the failed attempt lets the next click try again instead of failing instantly.
    script.onerror = () => {
      loading = null
      reject(new Error('paddle.js could not be loaded'))
    }
    document.head.append(script)
  })
  return loading
}

export type CheckoutInput = {
  environment: 'sandbox' | 'production'
  /** The public client token from GET /api/billing-config, never a hard-coded one. */
  token: string
  priceId: string
  email: string
  userId: string
}

/**
 * Opens the Paddle overlay for the base plan. The person's email and id travel with the checkout;
 * amounts stay inside Paddle, and `customData.userId` is how the webhook finds the account again.
 */
export async function openCheckout(input: CheckoutInput): Promise<void> {
  const paddle = await load()
  paddle.Environment.set(input.environment)
  paddle.Initialize({ token: input.token })
  paddle.Checkout.open({
    items: [{ priceId: input.priceId, quantity: 1 }],
    customer: { email: input.email },
    customData: { userId: input.userId },
  })
}
