/**
 * RSA 密钥对管理与 RS256 JWT 签名
 * 
 * 功能：
 * 1. 首次使用时自动生成 RSA-2048 密钥对，存储在 KV 中
 * 2. 使用 RSASSA-PKCS1-v1_5 + SHA-256 签名 JWT (RS256)
 * 3. 导出公钥为 JWK 格式供 JWKS 端点使用
 * 4. 支持 key rotation：新 key 签发，旧 key 仍可验证
 * 5. 向后兼容 HS256 旧 token
 */

import { CONSTANTS } from './shared'

/** KV 中存储的密钥对信息 */
interface StoredKeyPair {
  kid: string                // Key ID (RFC 7638 JWK Thumbprint)
  privateKeyJwk: JsonWebKey  // 私钥 JWK（用于签名）
  publicKeyJwk: JsonWebKey   // 公钥 JWK（用于验证 + JWKS）
  createdAt: number
}

/** KV 中存储的密钥集合 */
interface KeyStore {
  current: StoredKeyPair     // 当前用于签名的密钥
  previous?: StoredKeyPair  // 上一个密钥（验证用，rotation 期间）
}

const KEY_STORE_KV_KEY = 'jwt_key_store'

/**
 * 计算 JWK Thumbprint (RFC 7638)
 * 用于生成 key ID
 */
async function computeJwkThumbprint(jwk: JsonWebKey): Promise<string> {
  // RFC 7638: 仅取必要字段，按字典序排列
  const required: Record<string, string> = {}
  if (jwk.n) required.n = jwk.n
  if (jwk.e) required.e = jwk.e
  if (jwk.kty) required.kty = jwk.kty
  // 按字母序排列 key
  const sorted = Object.keys(required).sort().reduce((obj, key) => {
    obj[key] = required[key]
    return obj
  }, {} as Record<string, string>)

  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(sorted))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufferToBase64url(new Uint8Array(hash))
}

/** base64url 编码工具 */
function bufferToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** base64url 字符串编码 */
function base64urlEncode(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** base64url 解码为字符串 */
function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'))
}

export function createCrypto(kv: KVNamespace) {
  let cachedKeyStore: KeyStore | null = null

  /**
   * 生成新的 RSA-2048 密钥对
   */
  async function generateKeyPair(): Promise<StoredKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256',
      },
      true, // extractable
      ['sign', 'verify']
    )

    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    const kid = await computeJwkThumbprint(publicKeyJwk)

    return {
      kid,
      privateKeyJwk,
      publicKeyJwk,
      createdAt: Date.now(),
    }
  }

  /**
   * 从 KV 加载密钥对（带缓存）
   */
  async function loadKeyStore(): Promise<KeyStore> {
    if (cachedKeyStore) return cachedKeyStore

    const raw = await kv.get(KEY_STORE_KV_KEY)
    if (raw) {
      cachedKeyStore = JSON.parse(raw) as KeyStore
      return cachedKeyStore
    }

    // 首次使用：生成新密钥对
    const keyPair = await generateKeyPair()
    cachedKeyStore = { current: keyPair }
    await kv.put(KEY_STORE_KV_KEY, JSON.stringify(cachedKeyStore))
    return cachedKeyStore
  }

  /**
   * 获取当前签名密钥的 CryptoKey + kid
   */
  async function getSigningKey(): Promise<{ key: CryptoKey; kid: string }> {
    const ks = await loadKeyStore()
    const key = await crypto.subtle.importKey(
      'jwk',
      ks.current.privateKeyJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )
    return { key, kid: ks.current.kid }
  }

  /**
   * 获取验证密钥（按 kid 查找）
   */
  async function getVerifyKey(kid: string): Promise<CryptoKey | null> {
    const ks = await loadKeyStore()
    let keyPair: StoredKeyPair | undefined

    if (ks.current.kid === kid) {
      keyPair = ks.current
    } else if (ks.previous?.kid === kid) {
      keyPair = ks.previous
    }

    if (!keyPair) return null

    return crypto.subtle.importKey(
      'jwk',
      keyPair.publicKeyJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    )
  }

  /**
   * 获取 JWKS（公钥集合）
   */
  async function getJwks(): Promise<{ keys: Array<{ kty: string; kid: string; n: string; e: string; alg: string; use: string }> }> {
    const ks = await loadKeyStore()
    const keys: Array<{ kty: string; kid: string; n: string; e: string; alg: string; use: string }> = []

    const currentJwk = ks.current.publicKeyJwk
    keys.push({
      kty: currentJwk.kty as string,
      kid: ks.current.kid,
      n: currentJwk.n as string,
      e: currentJwk.e as string,
      alg: 'RS256',
      use: 'sig',
    })

    if (ks.previous) {
      const prevJwk = ks.previous.publicKeyJwk
      keys.push({
        kty: prevJwk.kty as string,
        kid: ks.previous.kid,
        n: prevJwk.n as string,
        e: prevJwk.e as string,
        alg: 'RS256',
        use: 'sig',
      })
    }

    return { keys }
  }

  /**
   * 密钥轮换（生成新密钥，旧密钥降级为 previous）
   */
  async function rotateKeys(): Promise<string> {
    const ks = await loadKeyStore()
    const newKeyPair = await generateKeyPair()
    cachedKeyStore = {
      current: newKeyPair,
      previous: ks.current, // 保留旧密钥用于验证
    }
    await kv.put(KEY_STORE_KV_KEY, JSON.stringify(cachedKeyStore))
    return newKeyPair.kid
  }

  /**
   * RS256 签名 JWT
   */
  async function signJWT(
    payload: Record<string, unknown>,
    expiresInSeconds: number
  ): Promise<string> {
    const { key, kid } = await getSigningKey()
    const header = { alg: 'RS256', typ: 'JWT', kid }

    const now = Math.floor(Date.now() / 1000)
    const jti = (payload.jti as string) || crypto.randomUUID()
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds, jti }

    const base64Header = base64urlEncode(JSON.stringify(header))
    const base64Payload = base64urlEncode(JSON.stringify(fullPayload))
    const signingInput = `${base64Header}.${base64Payload}`

    const encoder = new TextEncoder()
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      encoder.encode(signingInput)
    )
    const base64Signature = bufferToBase64url(new Uint8Array(signature))

    return `${signingInput}.${base64Signature}`
  }

  /**
   * RS256 验证 JWT
   * 自动从 header 提取 kid 并查找对应公钥
   */
  async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null

      const [base64Header, base64Payload, base64Signature] = parts
      const signingInput = `${base64Header}.${base64Payload}`

      // 解析 header 获取 kid
      const header = JSON.parse(base64urlDecode(base64Header)) as { alg?: string; kid?: string }
      if (header.alg !== 'RS256' || !header.kid) return null

      const verifyKey = await getVerifyKey(header.kid)
      if (!verifyKey) return null

      // 验证签名
      const signatureBytes = (() => {
        const binary = base64urlDecode(base64Signature)
        const arr = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          arr[i] = binary.charCodeAt(i)
        }
        return arr
      })()

      const encoder = new TextEncoder()
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        verifyKey,
        signatureBytes,
        encoder.encode(signingInput)
      )
      if (!valid) return null

      const payload = JSON.parse(base64urlDecode(base64Payload)) as Record<string, unknown>

      // 检查过期
      if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
        return null
      }

      return payload
    } catch {
      return null
    }
  }

  return {
    signJWT,
    verifyJWT,
    getJwks,
    rotateKeys,
    getSigningKey,
  }
}
