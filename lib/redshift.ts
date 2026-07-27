import { Pool } from 'pg'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.REDSHIFT_HOST,
      port:     Number(process.env.REDSHIFT_PORT ?? 5439),
      database: process.env.REDSHIFT_DB,
      user:     process.env.REDSHIFT_USER,
      password: process.env.REDSHIFT_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      max:      10,
      idleTimeoutMillis: 30_000,
      // Si el pool está saturado, fallar rápido en vez de colgar la petición
      // para siempre (evita el spinner infinito en modales/tarjetas).
      connectionTimeoutMillis: 15_000,
      // Corta queries desbocadas del lado de Redshift (las de usuario son <1s;
      // margen amplio para las agregaciones del sync).
      statement_timeout: 90_000,
    })
  }
  return pool
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}
