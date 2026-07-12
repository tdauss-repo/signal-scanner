import type { SavedScanRecord } from '../types/audit'

interface SavedScansPanelProps {
  currentScanId: string
  dirty: boolean
  scans: SavedScanRecord[]
  onSaveCurrent: () => void
  onSaveAsNew: () => void
  onLoad: (id: string) => void
  onDuplicate: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: (file: File) => void
  onStartBlank: () => void
}

const formatDateTime = (value: string) =>
  value ? new Date(value).toLocaleString() : 'Not saved yet'

export function SavedScansPanel({
  currentScanId,
  dirty,
  scans,
  onSaveCurrent,
  onSaveAsNew,
  onLoad,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  onImport,
  onStartBlank,
}: SavedScansPanelProps) {
  return (
    <section className="panel saved-scans-panel">
      <div className="panel-header split-header">
        <div>
          <p className="eyebrow">Saved Scans</p>
          <h2>Business profile and scan management</h2>
          <p>
            Save the full workspace for each business, including manual notes,
            listings, directory URLs, AI answers, search observations, voice
            readiness, Action Plan items, and report edits.
          </p>
        </div>
        <div className="save-status-card">
          <span>Current workspace</span>
          <strong>{dirty ? 'Unsaved changes' : 'Saved'}</strong>
        </div>
      </div>

      <div className="saved-scan-actions">
        <button type="button" onClick={onSaveCurrent}>
          Save current scan
        </button>
        <button type="button" className="secondary" onClick={onSaveAsNew}>
          Save as new scan
        </button>
        <button type="button" className="secondary" onClick={onStartBlank}>
          Start blank scan
        </button>
        <label className="import-scan-button">
          Import scan JSON
          <input
            accept="application/json,.json"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImport(file)
              event.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      <div className="saved-scan-list">
        {scans.length === 0 ? (
          <p className="empty-state">
            No saved scans yet. Save the current JEM scan before testing another
            business.
          </p>
        ) : (
          scans.map((scan) => (
            <article
              className={`saved-scan-card ${
                scan.id === currentScanId ? 'saved-scan-card-active' : ''
              }`}
              key={scan.id}
            >
              <div>
                <p className="eyebrow">
                  {scan.id === currentScanId ? 'Current scan' : 'Saved scan'}
                </p>
                <h3>{scan.businessName || 'Untitled business'}</h3>
                <p>{scan.website || 'No website entered'}</p>
                <p>{scan.localMarket || 'No local market entered'}</p>
              </div>
              <dl className="saved-scan-meta">
                <div>
                  <dt>Scan date</dt>
                  <dd>{formatDateTime(scan.scanDate)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(scan.updatedAt)}</dd>
                </div>
                {scan.notes ? (
                  <div>
                    <dt>Notes</dt>
                    <dd>{scan.notes}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="saved-scan-card-actions">
                <button type="button" onClick={() => onLoad(scan.id)}>
                  Load scan
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDuplicate(scan.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onRename(scan.id)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onExport(scan.id)}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onDelete(scan.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
