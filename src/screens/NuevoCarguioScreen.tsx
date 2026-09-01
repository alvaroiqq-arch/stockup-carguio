import { useState, useEffect } from 'react'
import {
  getTransporte, crearRegistro, actualizarRegistro,
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

type ModoPeso = 'bulto' | 'total'
type PesoTotal = { neto: string; bruto: string }

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
  onVolver, onGuardado, registroId, registroInicial, carguioDateInicial,
}: {
  onVolver: () => void
  onGuardado: () => void
  registroId?: number                  // si viene → modo edición
  registroInicial?: LoadingVehicle     // vehículo pre-relleno
  carguioDateInicial?: string | null   // fecha del carguío existente (modo edición)
}) {
  const modoEdicion = registroId !== undefined

  const [transporte, setTransporte] = useState<TransporteData | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [vehiculo, setVehiculoState] = useState<LoadingVehicle>(registroInicial ?? vehiculoVacio())
  const [fechaCarguio, setFechaCarguio] = useState<string>(
    // En edición: usar la fecha guardada. En nuevo: hoy en hora Santiago (en-CA = YYYY-MM-DD)
    carguioDateInicial
      ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  )

  // ── Modo de ingreso de pesos: 'bulto' (por unidad) o 'total' (suma total)
  const nLineas = (registroInicial ?? vehiculoVacio()).lines.length
  const [modosPeso, setModosPeso] = useState<ModoPeso[]>(Array(nLineas).fill('bulto'))
  const [totalPesos, setTotalPesos] = useState<PesoTotal[]>(Array(nLineas).fill({ neto: '', bruto: '' }))

  useEffect(() => {
    getTransporte()
      .then(setTransporte)
      .catch(e => console.error(e))
      .finally(() => setCargandoDatos(false))
  }, [])

  const patchVehiculo = (patch: Partial<LoadingVehicle>) =>
    setVehiculoState(prev => ({ ...prev, ...patch }))

  const patchLinea = (li: number, patch: Partial<LoadingLine>) =>
    setVehiculoState(prev => ({
      ...prev,
      lines: prev.lines.map((l, j) => j === li ? { ...l, ...patch } : l),
    }))

  const agregarLinea = () => {
    setVehiculoState(prev => ({ ...prev, lines: [...prev.lines, lineaVacia()] }))
    setModosPeso(prev => [...prev, 'bulto'])
    setTotalPesos(prev => [...prev, { neto: '', bruto: '' }])
  }

  const eliminarLinea = (li: number) => {
    setVehiculoState(prev => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((_, j) => j !== li) : prev.lines,
    }))
    if (vehiculo.lines.length > 1) {
      setModosPeso(prev => prev.filter((_, j) => j !== li))
      setTotalPesos(prev => prev.filter((_, j) => j !== li))
    }
  }

  const setModoPeso = (li: number, modo: ModoPeso) =>
    setModosPeso(prev => prev.map((m, i) => i === li ? modo : m))

  const patchTotalPeso = (li: number, patch: Partial<PesoTotal>) =>
    setTotalPesos(prev => prev.map((p, i) => i === li ? { ...p, ...patch } : p))

  // Seleccionar camion por patente → auto-llenar empresa y conductor desde asignacion
  const handlePatente = (truckId: number | undefined) => {
    if (!truckId) {
      patchVehiculo({ truck_id: undefined, transport_company_id: undefined, driver_id: undefined })
      return
    }
    const asig = transporte?.assignments.find(a => Number(a.truck_id) === Number(truckId))
    patchVehiculo({
      truck_id: truckId,
      transport_company_id: asig ? Number(asig.company_id) : undefined,
      driver_id: asig?.driver_id,
    })
  }

  const handleGuardar = async () => {
    for (const [li, l] of vehiculo.lines.entries()) {
      const modo = modosPeso[li] ?? 'bulto'
      if (!l.product_description.trim()) {
        setErrorGuardar(`Línea ${li + 1}: falta la descripción.`); return
      }
      if (!l.qty_bultos || l.qty_bultos <= 0) {
        setErrorGuardar(`Línea ${li + 1}: cantidad debe ser mayor a 0.`); return
      }
      if (modo === 'total') {
        if (!Number(totalPesos[li]?.neto) || Number(totalPesos[li]?.neto) <= 0) {
          setErrorGuardar(`Línea ${li + 1}: ingresa el peso neto total.`); return
        }
      } else {
        if (!l.weight_per_bulto_kg || l.weight_per_bulto_kg <= 0) {
          setErrorGuardar(`Línea ${li + 1}: peso neto debe ser mayor a 0.`); return
        }
      }
      if (l.tipo_bulto === 'PALLET' && (!l.bultos_por_pallet || l.bultos_por_pallet <= 0)) {
        setErrorGuardar(`Línea ${li + 1}: indique cuántos bultos trae cada pallet.`); return
      }
    }
    setErrorGuardar(''); setGuardando(true)
    // Siempre releer la asignación activa del camión al guardar.
    // Así, si el registro fue creado sin empresa/conductor y ahora sí existe
    // una asignación, queda grabada correctamente.
    const asigActual = vehiculo.truck_id
      ? transporte?.assignments.find(a => Number(a.truck_id) === Number(vehiculo.truck_id))
      : undefined
    const payload = {
      carguio_date: fechaCarguio || null,
      vehicles: [{
        transport_company_id: asigActual ? Number(asigActual.company_id) : (vehiculo.transport_company_id ?? undefined),
        driver_id: asigActual?.driver_id ?? vehiculo.driver_id,
        truck_id: vehiculo.truck_id,
        observations: vehiculo.observations?.trim() || undefined,
        lines: vehiculo.lines.map((l, li) => {
          const modo = modosPeso[li] ?? 'bulto'
          // Unidades totales (para PALLET: pallets × bultos/pallet; resto: qty_bultos)
          const unidades = l.tipo_bulto === 'PALLET'
            ? (Number(l.qty_bultos) * (Number(l.bultos_por_pallet) || 1))
            : Number(l.qty_bultos)
          // En modo total: calcular peso por bulto desde el total ingresado
          const pesoNeto = modo === 'total'
            ? Number(totalPesos[li]?.neto) / (unidades || 1)
            : Number(l.weight_per_bulto_kg)
          const pesoBruto = modo === 'total'
            ? (Number(totalPesos[li]?.bruto) || Number(totalPesos[li]?.neto)) / (unidades || 1)
            : (Number(l.gross_weight_per_bulto_kg) || Number(l.weight_per_bulto_kg))
          return {
            product_description: l.product_description.trim(),
            tipo_bulto: l.tipo_bulto,
            qty_bultos: Number(l.qty_bultos),
            weight_per_bulto_kg: pesoNeto,
            gross_weight_per_bulto_kg: pesoBruto,
            bultos_por_pallet: l.tipo_bulto === 'PALLET' ? (l.bultos_por_pallet ?? undefined) : undefined,
            tipo_bulto_contenido: l.tipo_bulto === 'PALLET' ? (l.tipo_bulto_contenido ?? undefined) : undefined,
          }
        }),
      }],
    }
    try {
      if (modoEdicion && registroId !== undefined) {
        await actualizarRegistro(registroId, payload)
      } else {
        await crearRegistro(payload)
      }
      onGuardado()
    } catch (e) {
      setErrorGuardar((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const limpiarFormulario = () => {
    if (!window.confirm('¿Limpiar todo el formulario?')) return
    setVehiculoState(vehiculoVacio())
    setErrorGuardar('')
  }

  const totalBultos = vehiculo.lines.reduce((s, l) => s + (Number(l.qty_bultos) * multiplicador(l) || 0), 0)
  const totalNeto   = vehiculo.lines.reduce((s, l) => s + calcNeto(l), 0)
  const totalBruto  = vehiculo.lines.reduce((s, l) => s + calcBruto(l), 0)

  // Info derivada de la asignacion del camion seleccionado
  const asig    = transporte?.assignments.find(a => Number(a.truck_id) === Number(vehiculo.truck_id))
  const empresa = asig ? transporte?.empresas.find(e => Number(e.id) === Number(asig.company_id)) : null

  if (cargandoDatos) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Cargando...</div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#00406A] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        <div className="font-bold text-lg flex-1">{modoEdicion ? 'Editar Carguío' : 'Nuevo Carguío'}</div>
        <button
          onClick={onVolver}
          className="text-white text-sm font-semibold border border-white/60 rounded px-3 py-1.5 active:bg-white/20"
        >
          ✕ Salir sin grabar
        </button>
      </header>

      <main className="flex-1 px-3 py-4 space-y-4 pb-36">

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {([['Bultos', totalBultos], ['Neto kg', totalNeto.toFixed(1)]] as [string, string|number][]).map(([label, val]) => (
            <div key={label} className="bg-[#00406A] text-white rounded-xl py-3">
              <div className="text-xs text-blue-200">{label}</div>
              <div className="font-bold text-lg">{val}</div>
            </div>
          ))}
        </div>
        {totalBruto > 0 && (
          <div className="text-center text-xs text-gray-400">Bruto total: {totalBruto.toFixed(1)} kg</div>
        )}

        {/* Datos del camion */}
        <div className="card space-y-3">

          {/* 0. Fecha del carguío */}
          <div>
            <label className="label">Fecha del carguío *</label>
            <input
              className="input"
              type="date"
              value={fechaCarguio}
              max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })}
              onChange={e => setFechaCarguio(e.target.value)}
            />
          </div>

          {/* 1. Patente */}
          <div>
            <label className="label">Patente *</label>
            <select
              className="input"
              value={vehiculo.truck_id ?? ''}
              onChange={e => handlePatente(Number(e.target.value) || undefined)}
            >
              <option value="">Seleccionar patente</option>
              {transporte?.camiones.map(c => (
                <option key={c.id} value={c.id}>
                  {c.patent}{c.truck_type ? ` — ${c.truck_type}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Empresa y conductor auto-derivados */}
          {vehiculo.truck_id && (
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

          {/* 3. Observaciones */}
          <div>
            <label className="label">Observaciones (opcional)</label>
            <input
              className="input"
              placeholder="Ej: Representante que despacha en aduana"
              value={vehiculo.observations ?? ''}
              onChange={e => patchVehiculo({ observations: e.target.value })}
            />
          </div>

          {/* 4. Líneas de carga */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Carga</div>

            {vehiculo.lines.map((l, li) => (
              <div key={li} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-500">Línea {li + 1}</div>
                  {vehiculo.lines.length > 1 && (
                    <button onClick={() => eliminarLinea(li)} className="text-red-400 text-xs">X</button>
                  )}
                </div>

                <div>
                  <label className="label text-xs">Marca / Modelo *</label>
                  <input
                    className="input text-sm"
                    placeholder="Ej: Braskem DMDA-8907"
                    value={l.product_description}
                    onChange={e => patchLinea(li, { product_description: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">
                    Escribe la marca o modelo del producto (no el nombre completo)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Tipo bulto *</label>
                    <select className="input text-sm" value={l.tipo_bulto}
                      onChange={e => patchLinea(li, {
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
                      onChange={e => patchLinea(li, { qty_bultos: Number(e.target.value) })} />
                  </div>
                </div>

                {/* Campos extra solo para PALLET */}
                {l.tipo_bulto === 'PALLET' && (
                  <div className="grid grid-cols-2 gap-2 bg-blue-50 rounded-lg p-2">
                    <div>
                      <label className="label text-xs">Tipo bulto dentro</label>
                      <select className="input text-sm" value={l.tipo_bulto_contenido ?? ''}
                        onChange={e => patchLinea(li, { tipo_bulto_contenido: e.target.value || undefined })}>
                        <option value="">Seleccionar</option>
                        {TIPOS_BULTO_CONTENIDO.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Bultos por pallet *</label>
                      <input className="input text-sm" type="number" inputMode="numeric" min="1"
                        placeholder="0"
                        value={l.bultos_por_pallet || ''}
                        onChange={e => patchLinea(li, { bultos_por_pallet: Number(e.target.value) || undefined })} />
                    </div>
                  </div>
                )}

                {/* Toggle modo peso */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold">
                  {(['bulto', 'total'] as ModoPeso[]).map(m => (
                    <button key={m} type="button"
                      onClick={() => setModoPeso(li, m)}
                      className={`flex-1 py-1.5 transition-colors ${
                        (modosPeso[li] ?? 'bulto') === m
                          ? 'bg-[#00406A] text-white'
                          : 'bg-white text-gray-500'
                      }`}>
                      {m === 'bulto' ? 'Peso por bulto' : 'Peso total'}
                    </button>
                  ))}
                </div>

                {(modosPeso[li] ?? 'bulto') === 'bulto' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Neto/bulto (kg) *</label>
                      <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                        placeholder="0.000"
                        value={l.weight_per_bulto_kg || ''}
                        onChange={e => patchLinea(li, { weight_per_bulto_kg: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label text-xs">Bruto/bulto (kg)</label>
                      <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                        placeholder="= neto si vacío"
                        value={l.gross_weight_per_bulto_kg || ''}
                        onChange={e => patchLinea(li, { gross_weight_per_bulto_kg: Number(e.target.value) })} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Neto TOTAL (kg) *</label>
                      <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                        placeholder="0.000"
                        value={totalPesos[li]?.neto ?? ''}
                        onChange={e => patchTotalPeso(li, { neto: e.target.value })} />
                    </div>
                    <div>
                      <label className="label text-xs">Bruto TOTAL (kg)</label>
                      <input className="input text-sm" type="number" inputMode="decimal" step="0.001"
                        placeholder="= neto si vacío"
                        value={totalPesos[li]?.bruto ?? ''}
                        onChange={e => patchTotalPeso(li, { bruto: e.target.value })} />
                    </div>
                  </div>
                )}

                {/* Resumen calculado */}
                {(() => {
                  const modo = modosPeso[li] ?? 'bulto'
                  const unidades = l.tipo_bulto === 'PALLET'
                    ? (l.qty_bultos * (l.bultos_por_pallet || 1))
                    : l.qty_bultos
                  const neto = modo === 'total'
                    ? Number(totalPesos[li]?.neto) || 0
                    : calcNeto(l)
                  const bruto = modo === 'total'
                    ? (Number(totalPesos[li]?.bruto) || neto)
                    : calcBruto(l)
                  if (!neto) return null
                  return (
                    <div className="text-xs text-[#00406A] font-semibold space-y-0.5">
                      {l.tipo_bulto === 'PALLET' && l.bultos_por_pallet && l.bultos_por_pallet > 0 && (
                        <div className="text-gray-500">
                          {l.qty_bultos} pallets × {l.bultos_por_pallet} = {unidades} bultos
                        </div>
                      )}
                      <div>Neto: {neto.toFixed(3)} kg / Bruto: {bruto.toFixed(3)} kg</div>
                      {modo === 'total' && unidades > 0 && (
                        <div className="text-gray-400 font-normal">
                          ({(neto / unidades).toFixed(3)} kg/bulto)
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}

            <button onClick={agregarLinea}
              className="w-full border border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm">
              + Agregar línea
            </button>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2 shadow-xl">
        {errorGuardar && <div className="text-red-600 text-sm font-medium">{errorGuardar}</div>}
        <div className="flex gap-2">
          <button onClick={limpiarFormulario} disabled={guardando}
            className="flex-none px-4 py-3 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium disabled:opacity-50">
            Limpiar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="flex-1 btn-primary disabled:opacity-50">
            {guardando ? 'Guardando...' : modoEdicion ? 'Guardar cambios' : 'Guardar carguío'}
          </button>
        </div>
      </div>
    </div>
  )
}
