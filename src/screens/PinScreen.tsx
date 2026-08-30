import { useState } from 'react'
import { verificarPin } from '../api'

export function PinScreen({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) verificar(next)
  }

  const handleBorrar = () => setPin(p => p.slice(0, -1))

  const verificar = async (p: string) => {
    setCargando(true)
    try {
      const ok = await verificarPin(p)
      if (ok) {
        sessionStorage.setItem('carguio_pin', p)
        onLogin()
      } else {
        setError('PIN incorrecto')
        setPin('')
      }
    } catch {
      setError('Sin conexión')
      setPin('')
    } finally {
      setCargando(false)
    }
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-[#00406A] flex flex-col items-center justify-center px-6">
      {/* Logo / título */}
      <div className="mb-10 text-center">
        <div className="text-white text-3xl font-bold tracking-tight">STOCK-UP</div>
        <div className="text-blue-200 text-sm mt-1">Registro de Carguío</div>
      </div>

      {/* Puntos PIN */}
      <div className="flex gap-4 mb-6">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              pin.length > i ? 'bg-white' : 'bg-blue-400/50'
            }`}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-300 text-sm mb-4 font-medium">{error}</div>
      )}
      {cargando && (
        <div className="text-blue-200 text-sm mb-4">Verificando…</div>
      )}

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {digits.map((d, i) => (
          <button
            key={i}
            disabled={cargando || d === ''}
            onClick={() => {
              if (d === '⌫') handleBorrar()
              else if (d) handleDigit(d)
            }}
            className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
              d === ''
                ? 'invisible'
                : d === '⌫'
                ? 'bg-blue-800 text-white'
                : 'bg-blue-800/60 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
