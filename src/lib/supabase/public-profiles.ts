/** View name for cross-user / public host profile reads (RLS-safe). */
export const PUBLIC_PROFILES_TABLE = "public_profiles" as const

/** Columns exposed by public_profiles — never request sensitive fields from this view. */
export const PUBLIC_PROFILE_COLUMNS =
  "id, full_name, first_name, avatar_url, bio, tagline, languages, house_rules, average_rating, total_reviews, response_rate, response_time_hours, host_since, is_host, id_verified" as const

export const PUBLIC_PROFILE_NAME_AVATAR_COLUMNS = "id, full_name, avatar_url" as const

export const PUBLIC_PROFILE_NAME_COLUMNS = "id, full_name" as const
