/**
 * api.ts — cliente HTTP para la app de carguío.
 * Usa el PIN almacenado en sessionStorage como header X-Carguio-Pin.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

function getPin(): string {
  return sessionStorage.getItem('carguio_pin') ?? ''
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Carguio-Pin': getPin(),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Cliente = { id: number; name: string; country: string | null; city: string | null }

export type Assignment = {
  id: number
  company_id: number
  driver_id: number
  driver_name: string
  driver_document_id: string | null
  truck_id: number | null
  license_plate: string | null
}

export type TransporteData = {
  empresas: { id: number; name: string }[]
  camiones: { id: number; patent: string; truck_type: string | null }[]
  assignments: Assignment[]
}

export type LoadingRecord = {
  id: number
  reference_code: string
  partner_id: number
  partner_name: string
  status: 'BORRADOR' | 'EN_PROCESO' | 'COMPLETADO' | 'FACTURADO' | 'ANULADO'
  total_vehicles: number
  total_bultos: number
  total_net_kg: string
  total_gross_kg: string
  country_destination: string | null
  destination_port: string | null
  incoterm: string | null
  sale_id: number | null
  created_at: string
  completed_at: string | null
  carguio_date: string | null   // fecha real de despacho (ingresada por el bodeguero)
  // Primer vehículo (para lista y Excel)
  license_plate: string | null
  driver_name: string | null
  transport_company_name: string | null
}

export type LoadingLine = {
  id?: number
  line_number?: number
  product_description: string
  tipo_bulto: 'FARDO' | 'SACO' | 'CAJA' | 'PALLET' | 'OTRO'
  qty_bultos: number
  weight_per_bulto_kg: number
  gross_weight_per_bulto_kg: number
  bultos_por_pallet?: number       // solo cuando tipo_bulto === 'PALLET'
  tipo_bulto_contenido?: string    // tipo de bulto dentro del pallet
  total_net_kg?: string
  total_gross_kg?: string
  notes?: string
}

export type LoadingVehicle = {
  id?: number
  sequence_number?: number
  transport_company_id?: number
  transport_company_name?: string | null
  driver_id?: number
  driver_name?: string | null
  truck_id?: number
  license_plate?: string | null
  observations?: string
  total_bultos?: number
  total_net_kg?: string
  total_gross_kg?: string
  lines: LoadingLine[]
}

export type NewRecord = {
  reference_code?: string   // se auto-genera en el backend si no viene
  partner_id?: number | null  // el dueño lo asigna al generar la factura
  country_destination?: string
  destination_port?: string
  embarkation_port?: string
  incoterm?: string
  notes?: string
  carguio_date?: string | null  // fecha real de despacho (YYYY-MM-DD)
  vehicles: LoadingVehicle[]
}

// ── API calls ────────────────────────────────────────────────────────────────

export const verificarPin = async (pin: string): Promise<boolean> => {
  // Puede lanzar si hay error de red o CORS — el caller lo captura y muestra "Sin conexión"
  const res = await fetch(`${BASE}/carguio/registros`, {
    headers: { 'X-Carguio-Pin': pin },
  })
  return res.status !== 401
}

export const getClientes = () => apiFetch<Cliente[]>('/carguio/clientes')

export const getTransporte = () => apiFetch<TransporteData>('/carguio/transporte')

// todos=1 incluye los FACTURADO (excluidos por defecto en el backend)
export const getRegistros = () => apiFetch<LoadingRecord[]>('/carguio/registros?todos=1')

export type ExportRow = {
  created_at: string
  carguio_date: string | null
  reference_code: string
  status: string
  license_plate: string | null
  driver_name: string | null
  transport_company_name: string | null
  line_number: number
  product_description: string
  tipo_bulto: string
  qty_bultos: number
  bultos_por_pallet: number | null
  tipo_bulto_contenido: string | null
  weight_per_bulto_kg: string
  gross_weight_per_bulto_kg: string
  total_net_kg: string
  total_gross_kg: string
}

export const getExport = () => apiFetch<ExportRow[]>('/carguio/export')

export const getRegistro = (id: number) => apiFetch<LoadingRecord & { vehicles: LoadingVehicle[] }>(`/carguio/registros/${id}`)

export const crearRegistro = (data: NewRecord) =>
  apiFetch<{ id: number; reference_code: string }>('/carguio/registros', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const completarRegistro = (id: number) =>
  apiFetch<{ ok: boolean }>(`/carguio/registros/${id}/completar`, { method: 'PATCH' })

export const actualizarRegistro = (id: number, data: Omit<NewRecord, 'reference_code' | 'partner_id'>) =>
  apiFetch<{ ok: boolean }>(`/carguio/registros/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const reabrirRegistro = (id: number) =>
  apiFetch<{ ok: boolean }>(`/carguio/registros/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'BORRADOR' }),
  })
