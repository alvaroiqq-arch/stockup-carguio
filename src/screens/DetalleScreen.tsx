import { useEffect, useState } from 'react'
import { getRegistro, completarRegistro, type LoadingRecord, type LoadingVehicle } from '../api'

function fmt(kg: string | undefined) {
  const n = parseFloat(kg ?? '0')
  return isNaN(n) ? '-' : n.toLocaleString('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function DetalleScreen({ id, onVolver }: { id: number; onVolver: () => void }) {
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

  if (cargando) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
      Cargando…
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-red-500">{error || 'No encontrado'}</div>
      <button onClick={onVolver} className="btn-secondary max-w-xs">Volver</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        <button onClick={onVolver} className="text-white text-xl pr-2">←</button>
        <div>
          <div className="font-bold text-lg leading-tight">{data.reference_code}</div>
          <div className="text-blue-200 text-xs">{data.partner_name}</div>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 space-y-3">
        {/* Resumen */}
        <div className="card">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-400">Camiones</div>
              <div className="text-2xl font-bold text-[#00406A]">{data.total_vehicles}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Bultos</div>
              <div className="text-2xl font-bold text-[#00406A]">{data.total_bultos}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Neto kg</div>
              <div className="text-xl font-bold text-[#00406A]">{fmt(data.total_net_kg)}</div>
            </div>
          </div>
          <div className="mt-3 text-center text-sm text-gray-500">
            Bruto: <strong>{fmt(data.total_gross_kg)} kg</strong>
          </div>
          {data.country_destination && (
            <div className="mt-2 text-xs text-gray-400 text-center">
              {data.country_destination}{data.destination_port ? ` · ${data.destination_port}` : ''}
              {data.incoterm ? ` · ${data.incoterm}` : ''}
            </div>
          )}
        </div>

        {/* Vehículos */}
        {data.vehicles.map((v, i) => (
          <div key={v.id ?? i} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[#00406A]">Camión {v.sequence_number}</div>
              <div className="text-sm font-mono font-bold text-gray-700">{v.license_plate ?? '-'}</div>
            </div>
            <div className="text-sm text-gray-600 space-y-0.5">
              {v.transport_company_name && <div>🏢 {v.transport_company_name}</div>}
              {v.driver_name && <div>👤 {v.driver_name}</div>}
            </div>

            {/* Líneas */}
            <div className="mt-3 space-y-2">
              {v.lines?.map((l, li) => (
                <div key={l.id ?? li} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-gray-800">{l.product_description}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-gray-600 text-xs">
                    <span>{l.qty_bultos} {l.tipo_bulto}</span>
                    <span>{parseFloat(String(l.weight_per_bulto_kg)).toFixed(3)} kg/u</span>
                    <span className="font-semibold">Neto: {fmt(l.total_net_kg)} kg</span>
                    <span>Bruto: {fmt(l.total_gross_kg)} kg</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
              <div className="bg-blue-50 rounded-lg py-2">
                <div className="text-gray-400">Bultos</div>
                <div className="font-bold text-[#00406A]">{v.total_bultos}</div>
              </div>
              <div className="bg-blue-50 rounded-lg py-2">
                <div className="text-gray-400">Neto kg</div>
                <div className="font-bold text-[#00406A]">{fmt(v.total_net_kg)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg py-2">
                <div className="text-gray-400">Bruto kg</div>
                <div className="font-bold text-[#00406A]">{fmt(v.total_gross_kg)}</div>
              </div>
            </div>

            {v.observations && (
              <div className="mt-2 text-xs text-gray-400">📝 {v.observations}</div>
            )}
          </div>
        ))}

        {/* Botón completar */}
        {(data.status === 'BORRADOR' || data.status === 'EN_PROCESO') && (
          <button onClick={handleCompletar} className="btn-primary bg-green-600">
            ✓ Marcar como Completado
          </button>
        )}
      </main>
    </div>
  )
}
