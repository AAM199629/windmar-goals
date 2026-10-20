import type { TeslaLeaderboardResponse } from '@/app/api/leaderboard-tesla/route'
import corte from './comptesla-corte.json'

// ── Corte final congelado de la Competencia Tesla (1ª edición) ─────────────────
// Foto del ranking tomada de /api/leaderboard-tesla el 20 oct 2026 (ventas con
// closing_date hasta el 15 oct). Desde ese momento el leaderboard y la tarjeta de
// cada vendedor leen SOLO esta foto: el sync sigue corriendo, pero ya no mueve lo
// que se ve de esta competencia. Para una nueva edición, poner COMPTESLA_CORTE en
// null y todo vuelve a leerse en vivo.
export const COMPTESLA_CORTE: (Omit<TeslaLeaderboardResponse, 'computedAt'> & { takenAt: string }) | null =
  corte as Omit<TeslaLeaderboardResponse, 'computedAt'> & { takenAt: string }

export const COMPTESLA_CORTE_NOTE =
  'Números sacados según el corte del día 20 de octubre a las 11:00am con las ventas hasta el 15 de octubre'

// Después de esta fecha (hora de PR) la tarjeta Tesla desaparece de todos los vendedores.
export const COMPTESLA_CARD_UNTIL = '2026-10-31'

export function comptesaCardVisible(now = new Date()): boolean {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' }) // YYYY-MM-DD
  return today <= COMPTESLA_CARD_UNTIL
}
