"use client"

import { AppleIcon } from "@/components/auth/AppleIcon"
import { GoogleIcon } from "@/components/auth/GoogleIcon"
import { authSocialButtonClassName } from "@/components/auth/auth-field-styles"
import { Button } from "@/components/ui/button"
import { enabledOAuthProviders, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "@/lib/auth/oauth"

type Props = {
  onSelect: (provider: OAuthProvider) => void
  loadingProvider: OAuthProvider | null
  disabled?: boolean
}

/**
 * "Continue with Apple / Google" buttons, grouped in one stack below the auth divider. Apple can be
 * hidden with NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=false.
 */
export function SocialAuthButtons({ onSelect, loadingProvider, disabled }: Props) {
  const providers = enabledOAuthProviders()
  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className={authSocialButtonClassName}
          onClick={() => onSelect(provider)}
          disabled={disabled}
        >
          {provider === "apple" ? (
            <AppleIcon className="size-5 shrink-0 text-black" />
          ) : (
            <GoogleIcon className="size-5 shrink-0" />
          )}
          {loadingProvider === provider ? "Redirecting..." : `Continue with ${OAUTH_PROVIDER_LABEL[provider]}`}
        </Button>
      ))}
    </div>
  )
}
