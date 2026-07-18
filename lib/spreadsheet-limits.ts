export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
export const MAX_SPREADSHEET_ROWS = 10_000
export const MAX_SPREADSHEET_COLUMNS = 100
export const MAX_SPREADSHEET_CELL_CHARS = 10_000

export function validateSpreadsheetShape(rows: unknown[][]): string | null {
  if (rows.length > MAX_SPREADSHEET_ROWS + 1) return `Files are limited to ${MAX_SPREADSHEET_ROWS.toLocaleString()} data rows.`
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (columns > MAX_SPREADSHEET_COLUMNS) return `Files are limited to ${MAX_SPREADSHEET_COLUMNS} columns.`
  for (const row of rows) {
    for (const cell of row) {
      if (String(cell ?? '').length > MAX_SPREADSHEET_CELL_CHARS) return 'A spreadsheet cell is too large to import safely.'
    }
  }
  return null
}
