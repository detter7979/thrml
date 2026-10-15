/** Ensure a Sheets API value is interpreted as a formula. */
export function fx(body: string) {
  const trimmed = body.trim()
  return trimmed.startsWith("=") ? trimmed : `=${trimmed}`
}

export const PERIODS = {
  mtdStart: `DATE(YEAR(TODAY()),MONTH(TODAY()),1)`,
  last30Start: `TODAY()-30`,
  last90Start: `TODAY()-90`,
  ytdStart: `DATE(YEAR(TODAY()),1,1)`,
  today: `TODAY()`,
  daysInMonth: `DAY(EOMONTH(TODAY(),0))`,
  dayOfMonth: `DAY(TODAY())`,
} as const

export function sumMarketplaceCol(
  col: string,
  start: string,
  end: string = PERIODS.today
) {
  return fx(
    `IFERROR(SUMIFS('Marketplace Data'!${col}:${col},'Marketplace Data'!A:A,">="&${start},'Marketplace Data'!A:A,"<="&${end}),0)`
  )
}

export function sumPlatformCol(
  col: string,
  start: string,
  end: string = PERIODS.today
) {
  return fx(
    `IFERROR(SUMIFS('Platform Data'!${col}:${col},'Platform Data'!A:A,">="&${start},'Platform Data'!A:A,"<="&${end}),0)`
  )
}

/**
 * Expenses tab (the expense log): A Date · B Vendor/Item · C Type · D Category · E Amount ·
 * F Source · G Receipt/Invoice · H Notes. Types: Recurring | Ad hoc | Ad platform | Other.
 */
export const EXPENSES_TAB = "Expenses"
const ex = `'${EXPENSES_TAB}'`

function sumExpensesOfType(type: string, start: string, end: string) {
  return `SUMIFS(${ex}!E:E,${ex}!A:A,">="&${start},${ex}!A:A,"<="&${end},${ex}!C:C,"${type}")`
}
function countExpensesOfType(type: string, start: string, end: string) {
  return `COUNTIFS(${ex}!A:A,">="&${start},${ex}!A:A,"<="&${end},${ex}!C:C,"${type}")`
}

/** Fixed Costs plan, prorated over the period (used until real recurring charges are logged). */
export function prorateFixedMonthly(start: string, end: string = PERIODS.today) {
  return fx(
    `IFERROR(SUMPRODUCT('Fixed Costs'!C2:C50)*(${end}-${start}+1)/${PERIODS.daysInMonth},0)`
  )
}

/** Recurring costs: logged "Recurring" expenses if any exist in the period, otherwise the plan. */
export function recurringInRange(start: string, end: string = PERIODS.today) {
  const plan = prorateFixedMonthly(start, end).replace(/^=/, "")
  return fx(
    `IFERROR(IF(${countExpensesOfType("Recurring", start, end)}>0,${sumExpensesOfType("Recurring", start, end)},${plan}),0)`
  )
}

/** One-off and other costs from the expense log (types "Ad hoc" and "Other"). */
export function sumAdHocInRange(start: string, end: string = PERIODS.today) {
  return fx(
    `IFERROR(${sumExpensesOfType("Ad hoc", start, end)}+${sumExpensesOfType("Other", start, end)},0)`
  )
}

/** Ad spend: logged "Ad platform" invoices if any exist in the period, otherwise Platform Data (API). */
export function adSpendInRange(col: string, start: string, end: string = PERIODS.today) {
  const api = sumPlatformCol(col, start, end).replace(/^=/, "")
  return fx(
    `IFERROR(IF(${countExpensesOfType("Ad platform", start, end)}>0,${sumExpensesOfType("Ad platform", start, end)},${api}),0)`
  )
}

export function pctOfGmv(valueCell: string, gmvCell: string) {
  return fx(`IFERROR(ABS(${valueCell})/ABS(${gmvCell}),0)`)
}

export function runRateMonthly(mtdCell: string) {
  return fx(`IFERROR(${mtdCell}/${PERIODS.dayOfMonth}*${PERIODS.daysInMonth},0)`)
}

export function runRateAnnual(mtdCell: string) {
  return fx(`IFERROR(${mtdCell}/${PERIODS.dayOfMonth}*365,0)`)
}

/** Build one row: [label, mtd, last30, last90, ytd, pctGmvFormula, source] */
export function periodRow(
  label: string,
  col: string,
  source: string,
  opts?: { negate?: boolean; isPlatform?: boolean; isAdSpend?: boolean; isFixed?: boolean; isAdHoc?: boolean }
) {
  const { mtdStart, last30Start, last90Start, ytdStart, today } = PERIODS
  const wrap = (f: string) => (opts?.negate ? fx(`-ABS(${f.replace(/^=/, "")})`) : f)

  let mtd: string
  let l30: string
  let l90: string
  let ytd: string

  if (opts?.isFixed) {
    mtd = wrap(recurringInRange(mtdStart, today))
    l30 = wrap(recurringInRange(last30Start, today))
    l90 = wrap(recurringInRange(last90Start, today))
    ytd = wrap(recurringInRange(ytdStart, today))
  } else if (opts?.isAdHoc) {
    mtd = wrap(sumAdHocInRange(mtdStart, today))
    l30 = wrap(sumAdHocInRange(last30Start, today))
    l90 = wrap(sumAdHocInRange(last90Start, today))
    ytd = wrap(sumAdHocInRange(ytdStart, today))
  } else if (opts?.isAdSpend) {
    mtd = wrap(adSpendInRange(col, mtdStart, today))
    l30 = wrap(adSpendInRange(col, last30Start, today))
    l90 = wrap(adSpendInRange(col, last90Start, today))
    ytd = wrap(adSpendInRange(col, ytdStart, today))
  } else if (opts?.isPlatform) {
    mtd = wrap(sumPlatformCol(col, mtdStart, today))
    l30 = wrap(sumPlatformCol(col, last30Start, today))
    l90 = wrap(sumPlatformCol(col, last90Start, today))
    ytd = wrap(sumPlatformCol(col, ytdStart, today))
  } else {
    mtd = wrap(sumMarketplaceCol(col, mtdStart, today))
    l30 = wrap(sumMarketplaceCol(col, last30Start, today))
    l90 = wrap(sumMarketplaceCol(col, last90Start, today))
    ytd = wrap(sumMarketplaceCol(col, ytdStart, today))
  }

  return [label, mtd, l30, l90, ytd, "", source]
}
