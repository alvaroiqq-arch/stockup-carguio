import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { getRegistros, getExport, completarRegistro, type LoadingRecord } from '../api'

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  FACTURADO: 'Facturado',
  ANULADO: 'Anulado',
}
const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: 'bg-gray-100 text-gray-600',
  EN_PROCESO: 'bg-yellow-100 text-yellow-700',
  COMPLETADO: 'bg-green-100 text-green-700',
  FACTURADO: 'bg-blue-100 text-blue-700',
  ANULADO: 'bg-red-100 text-red-700',
}

// Chips de filtro disponibles (null = Todos)
const FILTROS = [
  { label: 'Todos',      value: null },
  { label: 'Borrador',   value: 'BORRADOR' },
  { label: 'Completado', value: 'COMPLETADO' },
  { label: 'Facturado',  value: 'FACTURADO' },
] as const

type FiltroEstado = typeof FILTROS[number]['value']

function fmt(kg: string) {
  const n = parseFloat(kg)
  return isNaN(n) ? '-' : n.toLocaleString('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return '—'
  // YYYY-MM-DD (sin hora) → new Date() lo parsea como UTC midnight → en Santiago
  // (UTC-4) aparece el día anterior. Construir la fecha en hora LOCAL directamente.
  const s = String(iso)
  const solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const d = solo
    ? new Date(+solo[1]!, +solo[2]! - 1, +solo[3]!)  // medianoche local
    : new Date(s)
  return d.toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function ListaScreen({
  onNuevo,
  onDetalle,
}: {
  onNuevo: () => void
  onDetalle: (id: number) => void
}) {
  const [registros, setRegistros] = useState<LoadingRecord[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstado>(null)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try { setRegistros(await getRegistros()) }
    catch (e) { setError((e as Error).message) }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const handleCompletar = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Marcar este carguío como COMPLETADO? Ya no podrás editarlo.')) return
    try {
      await completarRegistro(id)
      await cargar()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const termino = busqueda.trim().toUpperCase()
  const visibles = registros.filter(r => {
    if (filtro && r.status !== filtro) return false
    if (termino && !(r.license_plate ?? '').toUpperCase().includes(termino)) return false
    return true
  })

  const [exportando, setExportando] = useState(false)

  const exportarExcel = async () => {
    setExportando(true)
    try {
      const datos = await getExport()

      // Filtrar por estado si hay filtro activo
      const codigosVisibles = new Set(visibles.map(r => r.reference_code))
      const filtrados = datos.filter(d => codigosVisibles.has(d.reference_code))

      const ESTADO_ES: Record<string, string> = {
        BORRADOR: 'Borrador', EN_PROCESO: 'En proceso',
        COMPLETADO: 'Completado', FACTURADO: 'Facturado', ANULADO: 'Anulado',
      }

      const filas = filtrados.map(d => {
        const esPallet = d.tipo_bulto === 'PALLET'
        const bpp = d.bultos_por_pallet ?? 1
        const totalBultos = esPallet ? d.qty_bultos * bpp : d.qty_bultos
        return {
          'Fecha':            fmtFecha(d.carguio_date ?? d.created_at),
          'Referencia':       d.reference_code,
          'Estado':           ESTADO_ES[d.status] ?? d.status,
          'Patente':          d.license_plate ?? '—',
          'Conductor':        d.driver_name ?? '—',
          'Empresa':          d.transport_company_name ?? '—',
          'Producto':         d.product_description,
          'Tipo bulto':       d.tipo_bulto,
          'N° pallets/bultos': d.qty_bultos,
          'Bultos por pallet': esPallet ? bpp : '—',
          'Tipo contenido':   d.tipo_bulto_contenido ?? '—',
          'Total bultos':     totalBultos,
          'Peso neto/bulto (kg)':  parseFloat(d.weight_per_bulto_kg) || 0,
          'Peso bruto/bulto (kg)': parseFloat(d.gross_weight_per_bulto_kg) || 0,
          'Total neto (kg)':   parseFloat(d.total_net_kg) || 0,
          'Total bruto (kg)':  parseFloat(d.total_gross_kg) || 0,
        }
      })

      const hoja = XLSX.utils.json_to_sheet(filas)
      hoja['!cols'] = [
        { wch: 12 }, { wch: 22 }, { wch: 12 },
        { wch: 10 }, { wch: 28 }, { wch: 28 },
        { wch: 30 }, { wch: 12 }, { wch: 18 },
        { wch: 16 }, { wch: 14 }, { wch: 12 },
        { wch: 20 }, { wch: 21 }, { wch: 16 }, { wch: 17 },
      ]
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Carguíos')
      const nombre = `carguios${filtro ? `_${filtro.toLowerCase()}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(libro, nombre)
    } catch (e) {
      alert('Error al exportar: ' + (e as Error).message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <div>
          <div className="font-bold text-lg leading-tight">Carguío</div>
          <div className="text-blue-200 text-xs">Stock-Up Bodega</div>
        </div>
        <button
          onClick={onNuevo}
          className="bg-white text-[#00406A] font-semibold px-4 py-2 rounded-xl text-sm active:opacity-70"
        >
          + Nuevo
        </button>
      </header>

      {/* Chips de filtro */}
      <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto">
        {FILTROS.map(f => (
          <button
            key={String(f.value)}
            onClick={() => setFiltro(f.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtro === f.value
                ? 'bg-[#00406A] text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.label}
            {f.value !== null && (
              <span className="ml-1 text-xs opacity-70">
                ({registros.filter(r => r.status === f.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Búsqueda por patente */}
      <div className="px-3 pt-1 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            inputMode="text"
            placeholder="Buscar por patente…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="input pl-8 text-sm"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg leading-none"
            >×</button>
          )}
        </div>
      </div>

      <main className="flex-1 px-3 py-1 space-y-3">
        {cargando && (
          <div className="text-center text-gray-400 py-10">Cargando…</div>
        )}
        {error && (
          <div className="card border-red-200 text-red-600 text-sm">
            ⚠ {error}
            <button onClick={cargar} className="ml-2 underline">Reintentar</button>
          </div>
        )}
        {!cargando && visibles.length === 0 && !error && (
          <div className="text-center text-gray-400 py-16">
            <div className="text-4xl mb-2">📦</div>
            <div>{filtro ? `Sin carguíos en estado "${ESTADO_LABEL[filtro]}"` : 'Sin carguíos activos'}</div>
            {!filtro && (
              <button onClick={onNuevo} className="mt-4 btn-primary max-w-xs mx-auto block">
                Registrar carguío
              </button>
            )}
          </div>
        )}

        {visibles.map(r => (
          <div
            key={r.id}
            className="card cursor-pointer active:bg-gray-50"
            onClick={() => onDetalle(r.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[#00406A] text-base truncate">
                  {r.reference_code}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {r.carguio_date
                    ? fmtFecha(r.carguio_date)
                    : fmtFecha(r.created_at)}
                </div>
              </div>
              <span className={`badge shrink-0 ${ESTADO_COLOR[r.status] ?? ''}`}>
                {ESTADO_LABEL[r.status] ?? r.status}
              </span>
            </div>

            {/* Dos filas de dos: identificación arriba, pesos abajo. En cuatro
                columnas un total de camión completo (25.000,000) no cabe. */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-xs text-gray-400">Patente</div>
                <div className="font-bold text-gray-800 text-xs font-mono">{r.license_plate ?? '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-xs text-gray-400">Bultos</div>
                <div className="font-bold text-gray-800 tabular-nums">{r.total_bultos}</div>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-xs text-gray-400">Neto (kg)</div>
                <div className="font-bold text-gray-800 text-sm tabular-nums">{fmt(r.total_net_kg)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-xs text-gray-400">Bruto (kg)</div>
                <div className="font-bold text-gray-800 text-sm tabular-nums">{fmt(r.total_gross_kg)}</div>
              </div>
            </div>

            {(r.status === 'EN_PROCESO' || r.status === 'BORRADOR') && (
              <button
                onClick={(e) => void handleCompletar(r.id, e)}
                className="mt-3 w-full bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm active:opacity-70"
              >
                ✓ Marcar como Completado
              </button>
            )}
          </div>
        ))}
      </main>

      {/* Acciones footer */}
      <footer className="pb-6 px-4 space-y-2">
        <button
          onClick={exportarExcel}
          disabled={visibles.length === 0 || exportando}
          className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base active:opacity-70 disabled:opacity-40"
        >
          {exportando ? 'Generando...' : `📥 Exportar Excel (${visibles.length} registros)`}
        </button>
        <button onClick={cargar} className="btn-secondary text-sm">
          ↻ Actualizar
        </button>
      </footer>
    </div>
  )
}
