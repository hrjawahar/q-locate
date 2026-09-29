import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from '../util'

export interface AdminEnv extends Env {
  TEAM_DOMAIN: string
  POLICY_AUD: string
  DEV_ADMIN_EMAIL?: string
}

export type Role = 'owner' | 'publisher' | 'editor'
export interface Admin { email: string; role: Role; scope: 'all' | 'vacation' | 'spiritual' }

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

async function emailFromAccess(request: Request, env: AdminEnv): Promise<string | null> {
  const host = new URL(request.url).hostname
  if ((host === 'localhost' || host === '127.0.0.1') && env.DEV_ADMIN_EMAIL) return env.DEV_ADMIN_EMAIL
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token || !env.TEAM_DOMAIN) return null
  const team = env.TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
  let set = jwks.get(team)
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`))
    jwks.set(team, set)
  }
  try {
    const { payload } = await jwtVerify(token, set, { issuer: `https://${team}`, ...(env.POLICY_AUD ? { audience: env.POLICY_AUD } : {}) })
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  } catch {
    return null
  }
}

export async function getAdmin(request: Request, env: AdminEnv): Promise<{ admin?: Admin; email?: string | null }> {
  const email = await emailFromAccess(request, env)
  if (!email) return { email: null }
  const row = await env.DB.prepare('SELECT email, role, scope FROM admins WHERE lower(email) = ? AND active = 1')
    .bind(email).first<Admin>()
  return row ? { admin: row, email } : { email }
}

export const canPublish = (a: Admin) => a.role === 'owner' || a.role === 'publisher'
export const inScope = (a: Admin, kind: unknown) => a.scope === 'all' || a.scope === kind
