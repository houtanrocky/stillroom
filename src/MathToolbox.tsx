import { useRef, useState } from 'react'
import { ChartNoAxesCombined, ExternalLink, X } from 'lucide-react'

const modes = [
  { label: '2D', path: 'graphing' },
  { label: '3D', path: '3d' },
] as const

type GraphMode = (typeof modes)[number]

function GraphingCalculator({ mode, hidden }: { mode: GraphMode; hidden: boolean }) {
  const [loaded, setLoaded] = useState(false)

  return <div className="math-toolbox-calculator" hidden={hidden}>
    {!loaded && <p role="status">Loading {mode.label} calculator...</p>}
    <iframe
      title={`GeoGebra ${mode.label} graphing calculator`}
      src={`https://www.geogebra.org/${mode.path}?embed`}
      sandbox="allow-scripts allow-same-origin allow-downloads"
      referrerPolicy="no-referrer"
      allowFullScreen
      onLoad={() => setLoaded(true)}
    />
  </div>
}

export default function MathToolbox() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<GraphMode>(modes[0])
  const [visitedModes, setVisitedModes] = useState<GraphMode[]>([])

  const selectMode = (next: GraphMode) => {
    setMode(next)
    setVisitedModes(visited => visited.includes(next) ? visited : [...visited, next])
  }

  return <>
    <button type="button" className="secondary-button math-toolbox-trigger" aria-haspopup="dialog" onClick={event => {
      event.currentTarget.focus()
      dialogRef.current?.showModal()
      selectMode(mode)
    }}>
      <ChartNoAxesCombined size={16} aria-hidden="true" /> Math toolbox
    </button>
    <dialog className="math-toolbox" aria-labelledby="math-toolbox-title" ref={dialogRef}>
      <div className="math-toolbox-heading">
        <h2 id="math-toolbox-title">Math toolbox</h2>
        <div className="math-toolbox-modes" role="group" aria-label="Graph dimensions">
          {modes.map(option => <button
            key={option.path}
            type="button"
            className="math-toolbox-mode"
            aria-pressed={mode === option}
            onClick={() => selectMode(option)}
          >{option.label}</button>)}
        </div>
        <form method="dialog">
          <button className="icon-button" aria-label="Close math toolbox"><X size={17} aria-hidden="true" /></button>
        </form>
      </div>
      <div className="math-toolbox-graphs">
        {modes.filter(option => visitedModes.includes(option)).map(option =>
          <GraphingCalculator key={option.path} mode={option} hidden={mode !== option} />
        )}
      </div>
      <footer className="math-toolbox-footer">
        <span>Made with GeoGebra®</span>
        <a href={`https://www.geogebra.org/${mode.path}`} target="_blank" rel="noreferrer">
          Open in GeoGebra <ExternalLink size={12} aria-hidden="true" />
        </a>
      </footer>
    </dialog>
  </>
}
