export declare function generatePKCE(length?: number): Promise<{
    verifier: string;
    challenge: string;
    method: string;
}>;
export declare function validatePKCE(verifier: string, challenge: string, method?: "S256" | "plain"): Promise<boolean>;
//# sourceMappingURL=pkce.d.ts.map