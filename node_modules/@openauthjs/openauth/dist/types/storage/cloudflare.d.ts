import type { KVNamespace } from "@cloudflare/workers-types";
import { StorageAdapter } from "./storage.js";
interface CloudflareStorageOptions {
    namespace: KVNamespace;
}
export declare function CloudflareStorage(options: CloudflareStorageOptions): StorageAdapter;
export {};
//# sourceMappingURL=cloudflare.d.ts.map