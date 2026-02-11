import { JWK, KeyLike } from "jose";
import { StorageAdapter } from "./storage/storage.js";
export interface KeyPair {
    id: string;
    alg: string;
    signing: {
        public: KeyLike;
        private: KeyLike;
    };
    encryption: {
        public: KeyLike;
        private: KeyLike;
    };
    created: Date;
    jwk: JWK;
}
export declare function keys(storage: StorageAdapter): Promise<KeyPair[]>;
//# sourceMappingURL=keys.d.ts.map