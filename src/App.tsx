import { useState, useEffect, useCallback } from 'react'
import { PinScreen } from './screens/PinScreen'
import { ListaScreen } from './screens/ListaScreen'
import { NuevoCarguioScreen } from './screens/NuevoCarguioScreen'
import { DetalleScreen } from './screens/DetalleScreen'

export type Screen =
  | { name: 'lista' }
  | { name: 'nuevo' }
  | { name: 'detalle'; id: number }

export default function App() {
  const [autenticado, setAutenticado] = useState(() => !!sessionStorage.getItem('carguio_pin'))
  const [screen, setScreen] = useState<Screen>({ name: 'lista' })

  const handleLogin = useCallback(() => setAutenticado(true), [])
  const irLista = useCallback(() => setScreen({ name: 'lista' }), [])
  const irNuevo = useCallback(() => setScreen({ name: 'nuevo' }), [])
  const irDetalle = useCallback((id: number) => setScreen({ name: 'detalle', id }), [])

  // Prevenir zoom accidental en iOS con double-tap
  useEffect(() => {
    document.addEventListener('dblclick', e => e.preventDefault())
  }, [])

  if (!autenticado) return <PinScreen onLogin={handleLogin} />

  if (screen.name === 'nuevo')
    return <NuevoCarguioScreen onVolver={irLista} onGuardado={irLista} />

  if (screen.name === 'detalle')
    return <DetalleScreen id={screen.id} onVolver={irLista} />

  return <ListaScreen onNuevo={irNuevo} onDetalle={irDetalle} />
}
