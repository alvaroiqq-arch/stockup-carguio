import { useState, useEffect } from 'react'
import {
  getClientes, getTransporte, crearRegistro,
  type Cliente, type TransporteData, type LoadingVehicle, type LoadingLine,
} from '../api'

const TIPOS_BULTO = ['FARDO', 'SACO', 'CAJA', 'PALLET', 'OTRO'] as const
type TipoBulto = typeof TIPOS_BULTO[number]

const lineaVacia = (): LoadingLine => ({
  product_description: '',
  tipo_bulto: 'FARDO',
  qty_bultos: 0,
  weight_per_bulto_kg: 0,
  gross_weight_per_bulto_kg: 0,
})

const vehiculoVacio = (): LoadingVehicle => ({
  transport_company_id: undefined,
  driver_id: undefined,
  truck_id: undefined,
  observations: '',
  lines: [lineaVacia()],
})

function calcNeto(l: LoadingLine) {
  return (l.qty_bultos * l.weight_per_bulto_kg) || 0
}
function calcBruto(l: LoadingLine) {
  const g = l.gross_weight_per_bulto_kg || l.weight_per_bulto_kg
  return (l.qty_bultos * g) || 0
}

export function NuevoCarguioScreen({
  onVolver,
  onGuardado,
}: {
  onVolver: () => void
  onGuardado: () => void
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [transporte, setTransporte] = useState<TransporteData | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')

  // Cabecera
  const [refCode, setRefCode] = useState('')
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [pais, setPais] = useState('')
  const [puerto, setPuerto] = useState('')
  const [incoterm, setIncoterm] = useState('')

  // Vehículos
  const [vehicles, setVehicles] = useState<LoadingVehicle[]>([vehiculoVacio()])

  useEffect(() => {
    Promise.all([getClientes(), getTransporte()])
      .then(([c, t]) => { setClientes(c); setTransporte(t) })
      .catch(e => console.error(e))
      .finally(() => setCargandoDatos(false))
  }, [])

  // ── Helpers vehículos ─────────────────────────────────────────────────────

  const setVehicle = (vi: number, patch: Partial<LoadingVehicle>) => {
    setVehicles(prev => prev.map((v, i) => i === vi ? { ...v, ...patch } : v))
  }

  const setLine = (vi: number, li: number, patch: Partial<LoadingLine>) => {
    setVehicles(prev => prev.map((v, i) => {
      if (i !== vi) return v
      return { ...v, lines: v.lines.map((l, j) => j === li ? { ...l, ...patch } : l) }
    }))
  }

  const agregarVehiculo = () => setVehicles(prev => [...prev, vehiculoVacio()])

  const eliminarVehiculo = (vi: number) => {
    if (vehicles.length === 1) return
    setVehicles(prev => prev.filter((_, i) => i !== vi))
  }

  const agregarLinea = (vi: number) => {
    setVehicles(prev => prev.map((v, i) =>
      i === vi ? { ...v, lines: [...v.lines, lineaVacia()] } : v
    ))
  }

  const eliminarLinea = (vi: number, li: number) => {
    setVehicles(prev => prev.map((v, i) => {
      if (i !== vi || v.lines.length === 1) return v
      return { ...v, lines: v.lines.filter((_, j) => j !== li) }
    }))
  }

  // Asignaciones filtradas por empresa
  const assignmentsPorEmpresa = (companyId: number | undefined) => {
    if (!transporte || !companyId) return transporte?.assignments ?? []
    return transporte.assignments.filter(a => a.company_id === companyId)
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  const handleGuardar = async () => {
    if (!refCode.trim()) { setErrorGuardar('El código de referencia es obligatorio.'); return }
    if (!partnerId) { setErrorGuardar('Selecciona un cliente.'); return }
    for (const [vi, v] of vehicles.entries()) {
      for (const [li, l] of v.lines.entries()) {
        if (!l.product_description.trim()) {
          setErrorGuardar(`Camión ${vi + 1}, línea ${li + 1}: falta la descripción del producto.`); return
        }
        if (!l.qty_bultos || l.qty_bultos <= 0) {
          setErrorGuardar(`Camión ${vi + 1}, línea ${li + 1}: la cantidad debe ser mayor a 0.`); return
        }
        if (!l.weight_per_bulto_kg || l.weight_per_bulto_kg <= 0) {
          setErrorGuardar(`Camión ${vi + 1}, línea ${li + 1}: el peso neto debe ser mayor a 0.`); return
        }
      }
    }

    setErrorGuardar(''); setGuardando(true)
    try {
      await crearRegistro({
        reference_code: refCode.trim(),
        partner_id: Number(partnerId),
        country_destination: pais.trim() || undefined,
        destination_port: puerto.trim() || undefined,
        incoterm: incoterm.trim() || undefined,
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

  // ── Totales globales ──────────────────────────────────────────────────────

  const totalBultos = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + (Number(l.qty_bultos) || 0), 0), 0)
  const totalNeto   = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + calcNeto(l), 0), 0)
  const totalBruto  = vehicles.reduce((s, v) => s + v.lines.reduce((s2, l) => s2 + calcBruto(l), 0), 0)

  if (cargandoDatos) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Cargando datos…</div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        <button onClick={onVolver} className="text-white text-xl pr-2">←</button>
        <div className="font-bold text-lg">Nuevo Carguío</div>
      </header>

      <main className="flex-1 px-3 py-4 space-y-4 pb-36">

        {/* ─ Cabecera ─────────────────────────────────────────────────── */}
        <div className="card space-y-3">
          <div className="font-bold text-[#00406A] text-sm uppercase tracking-wide">Datos generales</div>

          <div>
            <label className="label">Código de referencia *</label>
            <input
              className="input"
              placeholder="Ej: C-001"
              value={refCode}
              onChange={e => setRefCode(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Cliente *</label>
            <select className="input" value={partnerId} onChange={e => setPartnerId(Number(e.target.value) || '')}>
              <option value="">— Seleccionar —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.country ? ` · ${c.country}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">País destino</label>
              <input className="input" placeholder="Bolivia" value={pais} onChange={e => setPais(e.target.value)} />
            </div>
            <div>
              <label className="label">Puerto destino</label>
              <input className="input" placeholder="Interior La Paz" value={puerto} onChange={e => setPuerto(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Incoterm</label>
            <select className="input" value={incoterm} onChange={e => setIncoterm(e.target.value)}>
              <option value="">— Opcional —</option>
              {['FOB','CIF','EXW','CFR','DAP','DDP'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* ─ Totales preview ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Camiones', vehicles.length],
            ['Bultos', totalBultos],
            ['Neto kg', totalNeto.toFixed(3)],
          ].map(([label, val]) => (
            <div key={label} className="bg-[#00406A] text-white rounded-xl py-3">
              <div className="text-xs text-blue-200">{label}</div>
              <div className="font-bold text-lg">{val}</div>
            </div>
          ))}
        </div>
        {totalBruto > 0 && (
          <div className="text-center text-xs text-gray-400">Bruto total: {totalBruto.toFixed(3)} kg</div>
        )}

        {/* ─ Vehículos ────────────────────────────────────────────────── */}
        {vehicles.map((v, vi) => {
          const assignments = assignmentsPorEmpresa(v.transport_company_id)
          const selectedAssignment = assignments.find(
            a => a.driver_id === v.driver_id && (v.truck_id ? a.truck_id === v.truck_id : true)
          )

          return (
            <div key={vi} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#00406A]">🚛 Camión {vi + 1}</div>
                {vehicles.length > 1 && (
                  <button
                    onClick={() => eliminarVehiculo(vi)}
                    className="text-red-500 text-sm font-medium"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              {/* Empresa */}
              <div>
                <label className="label">Empresa de transporte</label>
                <select
                  className="input"
                  value={v.transport_company_id ?? ''}
                  onChange={e => setVehicle(vi, {
                    transport_company_id: Number(e.target.value) || undefined,
                    driver_id: undefined,
                    truck_id: undefined,
                  })}
                >
                  <option value="">— Seleccionar —</option>
                  {transporte?.empresas.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              {/* Conductor / Patente (desde assignments) */}
              {v.transport_company_id && (
                <div>
                  <label className="label">Conductor / Patente</label>
                  <select
                    className="input"
                    value={selectedAssignment?.id ?? ''}
                    onChange={e => {
                      const a = assignments.find(x => x.id === Number(e.target.value))
                      if (a) setVehicle(vi, {
                        driver_id: a.driver_id,
                        truck_id: a.truck_id ?? undefined,
                      })
                    }}
                  >
                    <option value="">— Seleccionar —</option>
                    {assignments.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.driver_name}{a.license_plate ? ` · ${a.license_plate}` : ''}
                      </option>
                    ))}
                  </select>
                  {assignments.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠ Esta empresa no tiene conductores asignados.
                    </p>
                  )}
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="label">Observaciones (opcional)</label>
                <input
                  className="input"
                  placeholder="Ej: 70 FARDOS FIBRA ACRÍLICA"
                  value={v.observations ?? ''}
                  onChange={e => setVehicle(vi, { observations: e.target.value })}
                />
              </div>

              {/* ─ Líneas de carga ───────────────────────────────────── */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Carga</div>

                {v.lines.map((l, li) => {
                  const netoLinea = calcNeto(l)
                  const brutoLinea = calcBruto(l)
                  return (
                    <div key={li} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-500">Línea {li + 1}</div>
                        {v.lines.length > 1 && (
                          <button onClick={() => eliminarLinea(vi, li)} className="text-red-400 text-xs">✕</button>
                        )}
                      </div>

                      <div>
                        <label className="label text-xs">Descripción del producto *</label>
                        <input
                          className="input text-sm"
                          placeholder="Ej: FIBRA ACRÍLICA 4.1"
                          value={l.product_description}
                          onChange={e => setLine(vi, li, { product_description: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-xs">Tipo de bulto *</label>
                          <select
                            className="input text-sm"
                            value={l.tipo_bulto}
                            onChange={e => setLine(vi, li, { tipo_bulto: e.target.value as TipoBulto })}
                          >
                            {TIPOS_BULTO.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Cantidad *</label>
                          <input
                            className="input text-sm"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            placeholder="0"
                            value={l.qty_bultos || ''}
                            onChange={e => setLine(vi, li, { qty_bultos: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-xs">Peso neto/u (kg) *</label>
                          <input
                            className="input text-sm"
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            placeholder="0.000"
                            value={l.weight_per_bulto_kg || ''}
                            onChange={e => setLine(vi, li, { weight_per_bulto_kg: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Peso bruto/u (kg)</label>
                          <input
                            className="input text-sm"
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            placeholder="= neto si vacío"
                            value={l.gross_weight_per_bulto_kg || ''}
                            onChange={e => setLine(vi, li, { gross_weight_per_bulto_kg: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      {/* Totales línea */}
                      {netoLinea > 0 && (
                        <div className="flex gap-4 text-xs text-[#00406A] font-semibold pt-1">
                          <span>Neto: {netoLinea.toFixed(3)} kg</span>
                          <span>Bruto: {brutoLinea.toFixed(3)} kg</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                <button
                  onClick={() => agregarLinea(vi)}
                  className="w-full border border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm"
                >
                  + Agregar línea
                </button>
              </div>
            </div>
          )
        })}

        {/* Agregar camión */}
        <button
          onClick={agregarVehiculo}
          className="btn-secondary"
        >
          + Agregar camión
        </button>
      </main>

      {/* Footer fijo — Guardar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2 shadow-xl">
        {errorGuardar && (
          <div className="text-red-600 text-sm font-medium">⚠ {errorGuardar}</div>
        )}
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="btn-primary disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : '✓ Guardar carguío'}
        </button>
      </div>
    </div>
  )
}
