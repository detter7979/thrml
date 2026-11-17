/**
 * Launch-list signups are promised silence until bookings open.
 * They join the biweekly Dispatch after that day.
 */
export function includeInBiweeklyDispatch(args: { launchNotify: boolean; preLaunch: boolean }): boolean {
  if (args.launchNotify && args.preLaunch) return false
  return true
}
