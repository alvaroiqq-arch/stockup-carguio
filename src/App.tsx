import { useState, useEffect, useCallback } from 'react'
import { PinScreen } from './screens/PinScreen'
import { ListaScreen } from './screens/ListaScreen'
import { NuevoCarguioScreen } from './screens/NuevoCarguioScreen'
import { DetalleScreen } from './screens/DetalleScreen'
import type { LoadingVehicle } from './api'

export type Screen =
  | { name: 'lista' }
  | { name: 'nuevo' }
  | { name: 'detalle'; id: number }
  | { name: 'editar'; id: number; vehiculo: LoadingVehicle; carguioDate: string | null }

export default function App() {
  const [autenticado, setAutenticado] = useState(() => !!sessionStorage.getItem('carguio_pin'))
  const [screen, setScreen] = useState<Screen>({ name: 'lista' })

  const handleLogin = useCallback(() => setAutenticado(true), [])
  const irLista = useCallback(() => setScreen({ name: 'lista' }), [])
  const irNuevo = useCallback(() => setScreen({ name: 'nuevo' }), [])
  const irDetalle = useCallback((id: number) => setScreen({ name: 'detalle', id }), [])
  const irEditar = useCallback((id: number, vehiculo: LoadingVehicle, carguioDate: string | null = null) =>
    setScreen({ name: 'editar', id, vehiculo, carguioDate }), [])

  // Prevenir zoom accidental en iOS con double-tap
  useEffect(() => {
    document.addEventListener('dblclick', e => e.preventDefault())
  }, [])

  if (!autenticado) return <PinScreen onLogin={handleLogin} />

  if (screen.name === 'nuevo')
    return <NuevoCarguioScreen onVolver={irLista} onGuardado={irLista} />

  if (screen.name === 'editar')
    return (
      <NuevoCarguioScreen
        onVolver={() => irDetalle(screen.id)}
        onGuardado={() => irDetalle(screen.id)}
        registroId={screen.id}
        registroInicial={screen.vehiculo}
        carguioDateInicial={screen.carguioDate}
      />
    )

  if (screen.name === 'detalle')
    return (
      <DetalleScreen
        id={screen.id}
        onVolver={irLista}
        onEditar={(v, d) => irEditar(screen.id, v, d)}
      />
    )

  return <ListaScreen onNuevo={irNuevo} onDetalle={irDetalle} />
}
