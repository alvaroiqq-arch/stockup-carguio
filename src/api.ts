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
}

export type LoadingLine = {
  id?: number
  line_number?: number
  product_description: string
  tipo_bulto: 'FARDO' | 'SACO' | 'CAJA' | 'PALLET' | 'OTRO'
  qty_bultos: number
  weight_per_bulto_kg: number
  gross_weight_per_bulto_kg: number
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
  reference_code: string
  partner_id: number
  country_destination?: string
  destination_port?: string
  embarkation_port?: string
  incoterm?: string
  notes?: string
  vehicles: LoadingVehicle[]
}

// ── API calls ────────────────────────────────────────────────────────────────

export const verificarPin = async (pin: string): Promise<boolean> => {
  try {
    const res = await fetch(`${BASE}/carguio/registros`, {
      headers: { 'X-Carguio-Pin': pin },
    })
    return res.status !== 401
  } catch {
    return false
  }
}

export const getClientes = () => apiFetch<Cliente[]>('/carguio/clientes')

export const getTransporte = () => apiFetch<TransporteData>('/carguio/transporte')

export const getRegistros = () => apiFetch<LoadingRecord[]>('/carguio/registros')

export const getRegistro = (id: number) => apiFetch<LoadingRecord & { vehicles: LoadingVehicle[] }>(`/carguio/registros/${id}`)

export const crearRegistro = (data: NewRecord) =>
  apiFetch<{ id: number; reference_code: string }>('/carguio/registros', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const completarRegistro = (id: number) =>
  apiFetch<{ ok: boolean }>(`/carguio/registros/${id}/completar`, { method: 'PATCH' })
