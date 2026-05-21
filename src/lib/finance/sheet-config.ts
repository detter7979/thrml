export const DEFAULT_FINANCE_TRACKER_SHEET_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
export const MARKETPLACE_DATA_TAB = "Marketplace Data"

export function resolveFinanceTrackerSheetId() {
  return (
    process.env.FINANCE_TRACKER_SHEET_ID?.trim() ||
    process.env.GDRIVE_FINANCE_TRACKER_SHEET_ID?.trim() ||
    DEFAULT_FINANCE_TRACKER_SHEET_ID
  )
}
