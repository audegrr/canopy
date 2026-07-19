type SpreadsheetValue = string | number | boolean | Date | null | undefined

function safeSheetName(name: string) {
  return name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Database'
}

export async function downloadXlsx(filename: string, sheetName: string, rows: SpreadsheetValue[][]) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const worksheet = workbook.addWorksheet(safeSheetName(sheetName))
  worksheet.addRows(rows)

  const columnCount = Math.max(0, ...rows.map(row => row.length))
  worksheet.columns = Array.from({ length: columnCount }, (_, index) => ({
    width: Math.min(80, Math.max(8, ...rows.map(row => String(row[index] ?? '').length))),
  }))

  const data = await workbook.xlsx.writeBuffer()
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return String(value)
  if ('result' in value) return cellText(value.result)
  if ('text' in value) return String(value.text ?? '')
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map(part => cellText(part)).join('')
  }
  return ''
}

export async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  await workbook.xlsx.load(data)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('The workbook has no readable worksheet.')

  const rows: string[][] = []
  worksheet.eachRow({ includeEmpty: true }, row => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map(cellText))
  })
  return rows
}
