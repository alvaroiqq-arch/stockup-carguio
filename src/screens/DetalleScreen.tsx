import { useEffect, useState } from 'react'
import { getRegistro, completarRegistro, reabrirRegistro, type LoadingRecord, type LoadingVehicle, type LoadingLine } from '../api'

function fmtKg(kg: string | number | undefined) {
  const n = parseFloat(String(kg ?? '0'))
  return isNaN(n) ? '-' : n.toLocaleString('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// Extrae YYYY-MM-DD del inicio del string para evitar el problema de UTC midnight.
// Funciona con '2026-08-27' y con '2026-08-27T00:00:00.000Z'.
function parseFechaSolo(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!) : new Date(iso)
}

function fmtFecha(iso: string) {
  const d = new Date(iso)   // timestamps con hora no tienen el problema UTC midnight
  return d.toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtFechaSolo(iso: string) {
  return parseFechaSolo(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function FilaLinea({ l }: { l: LoadingLine & { bultos_por_pallet?: number; tipo_bulto_contenido?: string; total_net_kg?: string; total_gross_kg?: string } }) {
  const esPallet = l.tipo_bulto === 'PALLET'
  const bpp = Number(l.bultos_por_pallet ?? 0)
  const totalBultos = esPallet && bpp > 0 ? l.qty_bultos * bpp : l.qty_bultos

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
      {/* Producto */}
      <div className="font-semibold text-gray-900 text-base">{l.product_description}</div>

      {/* Tipo y cantidad */}
      <div className="flex flex-wrap gap-2">
        <span className="bg-[#00406A] text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {l.tipo_bulto}
        </span>
        {esPallet && bpp > 0 ? (
          <span className="text-gray-700 text-xs">
            {l.qty_bultos} {l.qty_bultos === 1 ? 'pallet' : 'pallets'} × {bpp} bultos/pallet
            {' '}= <strong>{totalBultos} bultos</strong>
            {l.tipo_bulto_contenido ? ` (${l.tipo_bulto_contenido})` : ''}
          </span>
        ) : (
          <span className="text-gray-700 text-xs">
            <strong>{l.qty_bultos}</strong> {l.tipo_bulto === 'PALLET' ? 'pallets' : 'bultos'}
          </span>
        )}
      </div>

      {/* Pesos */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white rounded-lg p-2 border border-gray-100">
          <div className="text-gray-400">Peso neto/bulto</div>
          <div className="font-bold text-gray-800">{fmtKg(l.weight_per_bulto_kg)} kg</div>
        </div>
        <div className="bg-white rounded-lg p-2 border border-gray-100">
          <div className="text-gray-400">Neto total</div>
          <div className="font-bold text-[#00406A]">{fmtKg(l.total_net_kg)} kg</div>
        </div>
      </div>
    </div>
  )
}

export function DetalleScreen({ id, onVolver, onEditar }: {
  id: number
  onVolver: () => void
  onEditar: (v: LoadingVehicle, carguioDate: string | null) => void
}) {
  const [data, setData] = useState<(LoadingRecord & { vehicles: LoadingVehicle[] }) | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setCargando(true)
    getRegistro(id)
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setCargando(false))
  }, [id])

  const handleCompletar = async () => {
    if (!confirm('¿Marcar este carguío como COMPLETADO?')) return
    try {
      await completarRegistro(id)
      const updated = await getRegistro(id)
      setData(updated)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleReabrir = async () => {
    if (!confirm('¿Reabrir este carguío para editarlo?')) return
    try {
      await reabrirRegistro(id)
      const updated = await getRegistro(id)
      setData(updated)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleEditar = () => {
    if (!data?.vehicles[0]) return
    onEditar(data.vehicles[0], data.carguio_date ?? null)
  }

  if (cargando) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Cargando…</div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-red-500">{error || 'No encontrado'}</div>
      <button onClick={onVolver} className="btn-secondary max-w-xs">Volver</button>
    </div>
  )

  const statusColor: Record<string, string> = {
    BORRADOR: 'bg-yellow-100 text-yellow-700',
    EN_PROCESO: 'bg-blue-100 text-blue-700',
    COMPLETADO: 'bg-green-100 text-green-700',
    FACTURADO: 'bg-purple-100 text-purple-700',
    ANULADO: 'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        <button onClick={onVolver} className="text-white text-xl pr-2">←</button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg leading-tight">{data.reference_code}</div>
          <div className="text-blue-200 text-xs">
            {data.carguio_date
              ? fmtFechaSolo(data.carguio_date)
              : fmtFecha(data.created_at)}
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${statusColor[data.status] ?? ''}`}>
          {data.status}
        </span>
      </header>

      <main className="flex-1 px-3 py-4 space-y-4 pb-24">

        {/* Totales del registro */}
        <div className="card">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Totales</div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#00406A] text-white rounded-xl py-3">
              <div className="text-xs text-blue-200">Bultos</div>
              <div className="text-2xl font-bold">{data.total_bultos}</div>
            </div>
            <div className="bg-[#00406A] text-white rounded-xl py-3">
              <div className="text-xs text-blue-200">Neto kg</div>
              <div className="text-2xl font-bold">{fmtKg(data.total_net_kg)}</div>
            </div>
          </div>
        </div>

        {/* Vehículos */}
        {data.vehicles.map((v, i) => (
          <div key={v.id ?? i} className="card space-y-3">

            {/* Cabecera camión */}
            <div className="flex items-start gap-3">
              <div className="bg-[#00406A] text-white rounded-xl px-3 py-2 text-center min-w-[72px]">
                <div className="text-xs text-blue-200">Patente</div>
                <div className="font-bold text-base font-mono leading-tight">
                  {v.license_plate ?? '—'}
                </div>
              </div>
              <div className="flex-1 space-y-0.5 pt-1">
                <div className="font-semibold text-gray-800 text-sm">
                  {v.driver_name ?? <span className="text-gray-400">Sin conductor</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {v.transport_company_name ?? <span className="text-gray-400">Sin empresa</span>}
                </div>
              </div>
            </div>

            {v.observations && (
              <div className="text-xs text-gray-500 bg-yellow-50 rounded-lg px-3 py-2">
                📝 {v.observations}
              </div>
            )}

            {/* Líneas de carga */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Carga</div>
              {(v.lines ?? []).map((l, li) => (
                <FilaLinea key={l.id ?? li} l={l as LoadingLine & { bultos_por_pallet?: number; tipo_bulto_contenido?: string }} />
              ))}
            </div>

            {/* Subtotales del vehículo */}
            <div className="grid grid-cols-2 gap-1 text-center text-xs">
              <div className="bg-blue-50 rounded-lg py-2">
                <div className="text-gray-400">Bultos</div>
                <div className="font-bold text-[#00406A]">{v.total_bultos}</div>
              </div>
              <div className="bg-blue-50 rounded-lg py-2">
                <div className="text-gray-400">Neto kg</div>
                <div className="font-bold text-[#00406A]">{fmtKg(v.total_net_kg)}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Acciones según estado */}
        {data.status === 'BORRADOR' && (
          <div className="flex gap-2">
            <button onClick={handleEditar}
              className="flex-1 btn-secondary">
              ✏️ Editar
            </button>
            <button onClick={handleCompletar}
              className="flex-1 btn-primary bg-green-600">
              ✓ Completar
            </button>
          </div>
        )}
        {data.status === 'COMPLETADO' && (
          <button onClick={handleReabrir} className="btn-secondary">
            ↩ Reabrir para editar
          </button>
        )}
      </main>
    </div>
  )
}
