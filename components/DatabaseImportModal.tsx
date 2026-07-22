'use client'

import { useRef, useState } from 'react'
import type { DbField } from '@/lib/types'
import { MAX_SPREADSHEET_BYTES, validateSpreadsheetShape } from '@/lib/spreadsheet-limits'
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog'
import { readXlsx } from '@/lib/spreadsheet-xlsx'
import { Icon } from './Icons'

type ImportFieldDef = { header: string; existingId: string | null }

export default function DatabaseImportModal({ existingFields, onImport, onClose }: {
  pageId: string
  existingFields: DbField[]
  onImport: (fieldDefs: ImportFieldDef[], rows: string[][]) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'preview'>('pick')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [fieldDefs, setFieldDefs] = useState<ImportFieldDef[]>([])
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useAccessibleDialog(true, onClose)

  function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    if (lines.length === 0) return { headers: [], rows: [] }
    function parseLine(line: string): string[] {
      const result: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
          else inQ = !inQ
        } else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
        else cur += ch
      }
      result.push(cur)
      return result
    }
    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)
    return { headers, rows }
  }

  function handleFile(file: File) {
    setFileError('')
    if (file.size > MAX_SPREADSHEET_BYTES) {
      setFileError('Files are limited to 5 MB for safe import.')
      return
    }
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheetml') || file.type.includes('ms-excel')
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const parsed = await readXlsx(e.target?.result as ArrayBuffer)
          const validationError = validateSpreadsheetShape(parsed)
          if (validationError) { setFileError(validationError); return }
          if (parsed.length < 1) throw new Error('The worksheet is empty.')
          const hdrs = parsed[0].map(String)
          const dataRows = parsed.slice(1).map(r => hdrs.map((_, i) => String(r[i] ?? '')))
          if (hdrs.length === 0) throw new Error('The worksheet has no columns.')
          setHeaders(hdrs)
          setRows(dataRows)
          const defs: ImportFieldDef[] = hdrs.map(h => {
            const match = existingFields.find(f => f.name.toLowerCase() === h.toLowerCase())
            return { header: h, existingId: match?.id ?? null }
          })
          setFieldDefs(defs)
          setStep('preview')
        } catch (error) {
          setFileError(error instanceof Error ? error.message : 'Unable to read this spreadsheet safely.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        const validationError = validateSpreadsheetShape([parsed.headers, ...parsed.rows])
        if (validationError) { setFileError(validationError); return }
        if (parsed.headers.length === 0) return
        setHeaders(parsed.headers)
        setRows(parsed.rows)
        const defs: ImportFieldDef[] = parsed.headers.map(h => {
          const match = existingFields.find(f => f.name.toLowerCase() === h.toLowerCase())
          return { header: h, existingId: match?.id ?? null }
        })
        setFieldDefs(defs)
        setStep('preview')
      }
      reader.readAsText(file, 'utf-8')
    }
  }

  async function doImport() {
    setLoading(true)
    await onImport(fieldDefs, rows)
    setLoading(false)
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(15,10,5,0.35)' }} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, zIndex: 500, boxShadow: 'var(--shadow-lg)', width: 580, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div id="import-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Import CSV / Excel</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {step === 'pick' ? 'Upload a CSV or Excel file to import records' : `${rows.length} rows · ${headers.length} columns`}
            </div>
          </div>
          <button type="button" aria-label="Close import dialog" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, padding: '4px 6px', borderRadius: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>✕</button>
        </div>

        {step === 'pick' && (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
              style={{ width: '100%', border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--text-tertiary)' }}><Icon name="import" size={32} /></div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Drop a CSV or Excel file here</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>or click to browse · First row must be column headers</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {fileError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center' }}>{fileError}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
              CSV and Excel (.xlsx) files are supported. Notion exports work out of the box.
              Columns matching existing fields will be mapped automatically.
            </div>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
              {/* Column mapping */}
              <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Column mapping</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fieldDefs.map((def, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.header}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>→</span>
                      <span style={{ fontSize: 12, color: def.existingId ? 'var(--accent)' : 'var(--text-secondary)', background: def.existingId ? 'var(--accent-light)' : 'var(--sidebar-bg)', padding: '2px 8px', borderRadius: 4 }}>
                        {def.existingId
                          ? existingFields.find(f => f.id === def.existingId)?.name ?? def.header
                          : '+ New field'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Data preview */}
              <div style={{ padding: '14px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Preview ({Math.min(rows.length, 5)} of {rows.length} rows)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} style={{ padding: '4px 8px', background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setStep('pick')} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>← Back</button>
              <button onClick={doImport} disabled={loading}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: 6, fontSize: 13, cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Importing…' : `Import ${rows.length} records`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

