import { isSaunasOnlyLaunch } from "@/lib/launch-config"

/**
 * Marketing copy used in metadata (title tags, meta descriptions, link previews, schema).
 * Follows the launch scope so search results and shared links never promise service
 * types guests can't book yet. Flip NEXT_PUBLIC_SAUNAS_ONLY_LAUNCH=false to widen it.
 */
const SAUNAS_ONLY = isSaunasOnlyLaunch()

export const SITE_COPY = SAUNAS_ONLY
  ? {
      defaultTitle: "thrml — Book Private Saunas Near You",
      socialTitle: "thrml — Book Private Home Saunas by the Hour",
      description:
        "Book private home saunas by the hour, hosted by real people in Seattle. No memberships. No front desks.",
      socialDescription:
        "Book private backyard and cabin saunas by the hour, hosted by people in your city. No memberships. No front desks.",
      homeTitle: "Your Personal Sauna Awaits | Book Private Home Saunas Near You",
      homeDescription:
        "Book private backyard and cabin saunas by the hour in Seattle. No memberships, no crowds. Hosts earn by sharing their own sauna.",
      schemaDescription:
        "Book private home saunas by the hour, hosted by real people. No memberships. No front desks.",
    }
  : {
      defaultTitle: "thrml — Book Private Wellness Spaces",
      socialTitle: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
      description:
        "thrml is a peer-to-peer marketplace to book private saunas, cold plunges, float tanks, infrared therapy, and more — hosted by real people in Seattle.",
      socialDescription:
        "Book private saunas, cold plunges, float tanks and more — hosted by people in your city. No memberships. No front desks.",
      homeTitle: "Book Private Saunas, Cold Plunges & Float Tanks Near You | thrml",
      homeDescription:
        "Book private saunas, cold plunges and float tanks by the hour in Seattle, hosted by real people. No memberships, no crowds. Hosts earn by sharing their space.",
      schemaDescription:
        "Book private saunas, cold plunges, float tanks, infrared therapy, and more — hosted by real people. No memberships. No front desks.",
    }
