import {
  fireCapiEvent,
  type CapiUserDataInput,
  type FireCapiEventOptions,
} from "@/lib/meta-capi"

export type MetaCapiUserData = {
  email?: string
  phone?: string
  externalId?: string
}

/** @deprecated Prefer fireCapiEvent from @/lib/meta-capi */
export async function fireServerEvent(
  eventName: string,
  userData: MetaCapiUserData,
  customData?: Record<string, unknown>,
  options?: { eventId?: string; eventSourceUrl?: string }
): Promise<void> {
  const input: CapiUserDataInput = {
    email: userData.email,
    phone: userData.phone,
    externalId: userData.externalId,
  }
  await fireCapiEvent(eventName, {
    eventId: options?.eventId,
    eventSourceUrl: options?.eventSourceUrl,
    userData: input,
    customData,
  } satisfies FireCapiEventOptions)
}

export { fireCapiEvent }
