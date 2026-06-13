export const PRIVACY_REQUEST_SUBJECT_PREFIX = "Privacy Request:"

export const PRIVACY_REQUEST_TYPES = [
  { value: "access", label: "Access my data" },
  { value: "correct", label: "Correct my data" },
  { value: "delete", label: "Delete my data" },
  { value: "portability", label: "Data portability / export" },
  { value: "opt_out_sale_sharing", label: "Opt out of sale or sharing (advertising)" },
  { value: "withdraw_health_consent", label: "Withdraw consent — consumer health data (WA/NV)" },
  { value: "delete_health_data", label: "Delete consumer health data (WA/NV)" },
  { value: "other", label: "Other / question" },
] as const

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number]["value"]

const PRIVACY_REQUEST_TYPE_SET = new Set<string>(PRIVACY_REQUEST_TYPES.map((t) => t.value))

export function isPrivacyRequestType(value: string): value is PrivacyRequestType {
  return PRIVACY_REQUEST_TYPE_SET.has(value)
}

export function privacyRequestTypeLabel(value: PrivacyRequestType): string {
  return PRIVACY_REQUEST_TYPES.find((t) => t.value === value)?.label ?? value
}

export function buildPrivacyRequestSubject(requestType: PrivacyRequestType): string {
  return `${PRIVACY_REQUEST_SUBJECT_PREFIX} ${privacyRequestTypeLabel(requestType)}`
}

export const US_STATES_AND_TERRITORIES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const

const STATE_CODE_SET = new Set<string>(US_STATES_AND_TERRITORIES.map((s) => s.value))

export function isUsStateCode(value: string): boolean {
  return STATE_CODE_SET.has(value)
}

export function usStateLabel(code: string): string {
  return US_STATES_AND_TERRITORIES.find((s) => s.value === code)?.label ?? code
}

export function buildPrivacyRequestMessage(stateCode: string, details: string): string {
  const stateLine = `State of residence: ${usStateLabel(stateCode)} (${stateCode})`
  const trimmed = details.trim()
  if (!trimmed) return stateLine
  return `${stateLine}\n\n${trimmed}`
}
