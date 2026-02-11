import {
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  JWK,
  KeyLike,
} from "jose"
import { Storage, StorageAdapter } from "./storage/storage.js"

const alg = "RS512"

interface SerializedKeyPair {
  id: string
  publicKey: string
  privateKey: string
  created: number
}

export interface KeyPair {
  id: string
  alg: string
  signing: {
    public: KeyLike
    private: KeyLike
  }
  encryption: {
    public: KeyLike
    private: KeyLike
  }
  created: Date
  jwk: JWK
}

export async function keys(storage: StorageAdapter): Promise<KeyPair[]> {
  const results = [] as KeyPair[]
  const scanner = Storage.scan<SerializedKeyPair>(storage, ["oauth:key"])
  for await (const [_key, value] of scanner) {
    const publicKey = await importSPKI(value.publicKey, alg, {
      extractable: true,
    })
    const privateKey = await importPKCS8(value.privateKey, alg)
    const jwk = await exportJWK(publicKey)
    jwk.kid = value.id
    results.push({
      id: value.id,
      alg,
      created: new Date(value.created),
      signing: {
        public: publicKey,
        private: privateKey,
      },
      encryption: {
        public: await importSPKI(value.publicKey, "RSA-OAEP-512"),
        private: await importPKCS8(value.privateKey, "RSA-OAEP-512"),
      },
      jwk,
    })
  }
  if (results.length) return results

  const key = await generateKeyPair(alg, {
    extractable: true,
  })
  const serialized: SerializedKeyPair = {
    id: crypto.randomUUID(),
    publicKey: await exportSPKI(key.publicKey),
    privateKey: await exportPKCS8(key.privateKey),
    created: Date.now(),
  }
  await Storage.set(storage, ["oauth:key", serialized.id], serialized)
  return keys(storage)
}
