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

export function prorateFixedMonthly(start: string, end: string = PERIODS.today) {
  return fx(
    `IFERROR(SUMPRODUCT('Fixed Costs'!C2:C50)*(${end}-${start}+1)/${PERIODS.daysInMonth},0)`
  )
}

export function sumAdHocInRange(start: string, end: string = PERIODS.today) {
  // Ad Hoc Costs: col A = date, col D = amount
  return fx(
    `IFERROR(SUMIFS('Ad Hoc Costs'!D:D,'Ad Hoc Costs'!A:A,">="&${start},'Ad Hoc Costs'!A:A,"<="&${end}),0)`
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
  opts?: { negate?: boolean; isPlatform?: boolean; isFixed?: boolean; isAdHoc?: boolean }
) {
  const { mtdStart, last30Start, last90Start, ytdStart, today } = PERIODS
  const wrap = (f: string) => (opts?.negate ? fx(`-ABS(${f.replace(/^=/, "")})`) : f)

  let mtd: string
  let l30: string
  let l90: string
  let ytd: string

  if (opts?.isFixed) {
    mtd = wrap(prorateFixedMonthly(mtdStart, today))
    l30 = wrap(fx(`SUMPRODUCT('Fixed Costs'!C2:C50)*30/${PERIODS.daysInMonth}`))
    l90 = wrap(fx(`SUMPRODUCT('Fixed Costs'!C2:C50)*90/${PERIODS.daysInMonth}`))
    ytd = wrap(
      fx(
        `SUMPRODUCT('Fixed Costs'!C2:C50)*(${today}-${ytdStart}+1)/${PERIODS.daysInMonth}`
      )
    )
  } else if (opts?.isAdHoc) {
    mtd = wrap(sumAdHocInRange(mtdStart, today))
    l30 = wrap(sumAdHocInRange(last30Start, today))
    l90 = wrap(sumAdHocInRange(last90Start, today))
    ytd = wrap(sumAdHocInRange(ytdStart, today))
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
