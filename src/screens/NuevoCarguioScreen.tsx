import { useState, useEffect } from 'react'
import {
  getTransporte, crearRegistro,
  type TransporteData, type LoadingVehicle, type LoadingLine,
} from '../api'

const TIPOS_BULTO = ['FARDO', 'SACO', 'CAJA', 'PALLET', 'OTRO'] as const
const TIPOS_BULTO_CONTENIDO = ['FARDO', 'SACO', 'CAJA', 'OTRO'] as const
type TipoBulto = typeof TIPOS_BULTO[number]

const lineaVacia = (): LoadingLine => ({
  product_description: '',
  tipo_bulto: 'FARDO',
  qty_bultos: 0,
  weight_per_bulto_kg: 0,
  gross_weight_per_bulto_kg: 0,
  bultos_por_pallet: undefined,
  tipo_bulto_contenido: undefined,
})

const vehiculoVacio = (): LoadingVehicle => ({
  transport_company_id: undefined,
  driver_id: undefined,
  truck_id: undefined,
  observations: '',
  lines: [lineaVacia()],
})

function multiplicador(l: LoadingLine) { return l.tipo_bulto === 'PALLET' ? (l.bultos_por_pallet || 1) : 1 }
function calcNeto(l: LoadingLine) { return (l.qty_bultos * multiplicador(l) * l.weight_per_bulto_kg) || 0 }
function calcBruto(l: LoadingLine) {
  const g = l.gross_weight_per_bulto_kg || l.weight_per_bulto_kg
  return (l.qty_bultos * multiplicador(l) * g) || 0
}

export function NuevoCarguioScreen({
  onVolver, onGuardado,
}: { onVolver: () => void; onGuardado: () => void }) {
  const [transporte, setTransporte] = useState<TransporteData | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [vehicles, setVehicles] = useState<LoadingVehicle[]>([vehiculoVacio()])

  useEffect(() => {
    getTransporte()
      .then(setTransporte)
      .catch(e => console.error(e))
      .finally(() => setCargandoDatos(false))
  }, [])

  const setVehicle = (vi: number, patch: Partial<LoadingVehicle>) =>
    setVehicles(prev => prev.map((v, i) => i === vi ? { ...v, ...patch } : v))

  const setLine = (vi: number, li: number, patch: Partial<LoadingLine>) =>
    setVehicles(prev => prev.map((v, i) => {
      if (i !== vi) return v
      return { ...v, lines: v.lines.map((l, j) => j === li ? { ...l, ...patch } : l) }
    }))

  const agregarVehiculo = () => setVehicles(prev => [...prev, vehiculoVacio()])
  const eliminarVehiculo = (vi: number) => { if (vehicles.length > 1) setVehicles(prev => prev.filter((_, i) => i !== vi)) }
  const agregarLinea = (vi: number) => setVehicles(prev => prev.map((v, i) => i === vi ? { ...v, lines: [...v.lines, lineaVacia()] } : v))
  const eliminarLinea = (vi: number, li: number) => setVehicles(prev => prev.map((v, i) => {
    if (i !== vi || v.lines.length === 1) return v
    return { ...v, lines: v.lines.filter((_, j) => j !== li) }
  }))

  // Seleccionar camion por patente → auto-llenar empresa y conductor desde asignacion
  const handlePatente = (vi: number, truckId: number | undefined) => {
    if (!truckId) {
      setVehicle(vi, { truck_id: undefined, transport_company_id: undefined, driver_id: undefined })
      return
    }
    const asig = transporte?.assignments.find(a => Number(a.truck_id) === Number(truckId))
    setVehicle(vi, {
      truck_id: truckId,
      transport_company_id: asig ? Number(asig.company_id) : undefined,
      driver_id: asig?.driver_id,
    })
  }

  const handleGuardar = async () => {
    for (const [vi, v] of vehicles.entries()) {
      for (const [li, l] of v.lines.entries()) {
        if (!l.product_description.trim()) {
          setErrorGuardar(`Camion ${vi + 1}, linea ${li + 1}: falta la descripcion.`); return
        }
        if (!l.qty_bultos || l.qty_bultos <= 0) {
          setErrorGuardar(`Camion ${vi + 1}, linea ${li + 1}: cantidad debe ser mayor a 0.`); return
        }
        if (!l.weight_per_bulto_kg || l.weight_per_bulto_kg <= 0) {
          setErrorGuardar(`Camion ${vi + 1}, linea ${li + 1}: peso neto debe ser mayor a 0.`); return
        }
        if (l.tipo_bulto === 'PALLET' && (!l.bultos_por_pallet || l.bultos_por_pallet <= 0)) {
          setErrorGuardar(`Camion ${vi + 1}, linea ${li + 1}: indique cuantos bultos trae cada pallet.`); return
        }
      }
    }
    setErrorGuardar(''); setGuardando(true)
    try {
      await crearRegistro({
        vehicles: vehicles.map(v => ({
          transport_company_id: v.transport_company_id,
          driver_id: v.driver_id,
          truck_id: v.truck_id,
          observations: v.observations?.trim() || undefined,
          lines: v.lines.map(l => ({
            product_description: l.product_description.trim(),
            tipo_bulto: l.tipo_bulto,
            qty_bultos: Number(l.qty_bultos),
            weight_per_bulto_kg: Number(l.weight_per_bulto_kg),
            gross_weight_per_bulto_kg: Number(l.gross_weight_per_bulto_kg) || Number(l.weight_per_bulto_kg),
            bultos_por_pallet: l.tipo_bulto === 'PALLET' ? (l.bultos_por_pallet ?? undefined) : undefined,
            tipo_bulto_contenido: l.tipo_bulto === 'PALLET' ? (l.tipo_bulto_contenido ?? undefined) : undefined,
          })),
        })),
      })
      onGuardado()
    } catch (e) {
      setErrorGuardar((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const totalBultos = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + (Number(l.qty_bultos) || 0), 0), 0)
  const totalNeto   = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + calcNeto(l), 0), 0)
  const totalBruto  = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + calcBruto(l), 0), 0)

  if (cargandoDatos) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Cargando...</div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        <button onClick={onVolver} className="text-white text-xl pr-2">arrow</button>
        <div className="font-bold text-lg">Nuevo Carguio</div>
      </header>

      <main className="flex-1 px-3 py-4 space-y-4 pb-36">
        <div className="grid grid-cols-3 gap-2 text-center">
          {([['Camiones', vehicles.length], ['Bultos', totalBultos], ['Neto kg', totalNeto.toFixed(1)]] as [string, string|number][]).map(([label, val]) => (
            <div key={label} className="bg-[#00406A] text-white rounded-xl py-3">
              <div className="text-xs text-blue-200">{label}</div>
              <div className="font-bold text-lg">{val}</div>
            </div>
          ))}
        </div>
        {totalBruto > 0 && (
          <div className="text-center text-xs text-gray-400">Bruto total: {totalBruto.toFixed(1)} kg</div>
        )}

        {vehicles.map((v, vi) => {
          // Info derivada de la asignacion del camion seleccionado
          const asig = transporte?.assignments.find(a => Number(a.truck_id) === Number(v.truck_id))
          const empresa = asig ? transporte?.empresas.find(e => Number(e.id) === Number(asig.company_id)) : null

          return (
            <div key={vi} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#00406A]">Camion {vi + 1}</div>
                {vehicles.length > 1 && (
                  <button onClick={() => eliminarVehiculo(vi)} className="text-red-500 text-sm font-medium">Eliminar</button>
                )}
              </div>

              {/* 1. Patente — punto de entrada */}
              <div>
                <label className="label">Patente *</label>
                <select
                  className="input"
                  value={v.truck_id ?? ''}
                  onChange={e => handlePatente(vi, Number(e.target.value) || undefined)}
                >
                  <option value="">Seleccionar patente</option>
                  {transporte?.camiones.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.patent}{c.truck_type ? ` — ${c.truck_type}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Empresa y conductor — se llenan solos desde la asignacion */}
              {v.truck_id && (
                <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">Empresa</span>
                    <span className="font-medium text-[#00406A]">
                      {empresa?.name ?? <span className="text-amber-600">Sin empresa asignada</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">Conductor</span>
                    <span className="font-medium text-[#00406A]">
                      {asig?.driver_name ?? <span className="text-amber-600">Sin conductor asignado</span>}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Observaciones (opcional)</label>
                <input
                  className="input"
                  placeholder="Ej: Representante que despacha en aduana"
                  value={v.observations ?? ''}
                  onChange={e => setVehicle(vi, { observations: e.target.value })}
                />
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Carga</div>

                {v.lines.map((l, li) => (
                  <div key={li} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-500">Linea {li + 1}</div>
                      {v.lines.length > 1 && (
                        <button onClick={() => eliminarLinea(vi, li)} className="text-red-400 text-xs">X</button>
                      )}
                    </div>

                    <div>
                      <label className="label text-xs">Producto *</label>
                      <input
                        className="input text-sm"
                        placeholder="Ej: FIBRA ACRILICA 4.1"
                        value={l.product_description}
                        onChange={e => setLine(vi, li, { product_description: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label text-xs">Tipo bulto *</label>
                        <select className="input text-sm" value={l.tipo_bulto}
                          onChange={e => setLine(vi, li, {
                            tipo_bulto: e.target.value as TipoBulto,
                            bultos_por_pallet: undefined,
                            tipo_bulto_contenido: undefined,
                          })}>
                          {TIPOS_BULTO.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">{l.tipo_bulto === 'PALLET' ? 'N° pallets *' : 'Cantidad *'}</label>
                        <input className="input text-sm" type="number" inputMode="numeric" min="1"
                          placeholder="0"
                          value={l.qty_bultos || ''}
                          onChange={e => setLine(vi, li, { qty_bultos: Number(e.target.value) })} />
                      </div>
                    </div>

                    {/* Campos extra solo para PALLET */}
                    {l.tipo_bulto === 'PALLET' && (
                      <div className="grid grid-cols-2 gap-2 bg-blue-50 rounded-lg p-2">
                        <div>
                          <label className="label text-xs">Tipo bulto dentro</label>
                          <select className="input text-sm" value={l.tipo_bulto_contenido ?? ''}
                            onChange={e => setLine(vi, li, { tipo_bulto_contenido: e.target.value || undefined })}>
                            <option value="">Seleccionar</option>
                            {TIPOS_BULTO_CONTENIDO.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Bultos por pallet *</label>
                          <input className="input text-sm" type="number" inputMode="numeric" min="1"
                            placeholder="0"
                            value={l.bultos_por_pallet || ''}
                            onChange={e => setLine(vi, li, { bultos_por_pallet: Number(e.target.value) || undefined })} />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label text-xs">Peso neto/bulto (kg) *</label>
                        <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                          placeholder="0.000"
                          value={l.weight_per_bulto_kg || ''}
                          onChange={e => setLine(vi, li, { weight_per_bulto_kg: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="label text-xs">Peso bruto/bulto (kg)</label>
                        <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                          placeholder="= neto si vacio"
                          value={l.gross_weight_per_bulto_kg || ''}
                          onChange={e => setLine(vi, li, { gross_weight_per_bulto_kg: Number(e.target.value) })} />
                      </div>
                    </div>

                    {calcNeto(l) > 0 && (
                      <div className="text-xs text-[#00406A] font-semibold space-y-0.5">
                        {l.tipo_bulto === 'PALLET' && l.bultos_por_pallet && l.bultos_por_pallet > 0 && (
                          <div className="text-gray-500">
                            {l.qty_bultos} pallets × {l.bultos_por_pallet} = {l.qty_bultos * l.bultos_por_pallet} bultos
                          </div>
                        )}
                        <div>Neto: {calcNeto(l).toFixed(1)} kg / Bruto: {calcBruto(l).toFixed(1)} kg</div>
                      </div>
                    )}
                  </div>
                ))}

                <button onClick={() => agregarLinea(vi)}
                  className="w-full border border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm">
                  + Agregar linea
                </button>
              </div>
            </div>
          )
        })}

        <button onClick={agregarVehiculo} className="btn-secondary">+ Agregar camion</button>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2 shadow-xl">
        {errorGuardar && <div className="text-red-600 text-sm font-medium">{errorGuardar}</div>}
        <button onClick={handleGuardar} disabled={guardando} className="btn-primary disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar carguio'}
        </button>
      </div>
    </div>
  )
}
