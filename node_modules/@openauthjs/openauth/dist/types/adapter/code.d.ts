export type CodeAdapterState = {
    type: "start";
} | {
    type: "code";
    resend?: boolean;
    code: string;
    claims: Record<string, string>;
};
export type CodeAdapterError = {
    type: "invalid_code";
} | {
    type: "invalid_claim";
    key: string;
    value: string;
};
export declare function CodeAdapter<Claims extends Record<string, string> = Record<string, string>>(config: {
    length?: number;
    request: (req: Request, state: CodeAdapterState, form?: FormData, error?: CodeAdapterError) => Promise<Response>;
    sendCode: (claims: Claims, code: string) => Promise<void | CodeAdapterError>;
}): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        claims: Claims;
    }>): void;
};
export type CodeAdapterOptions = Parameters<typeof CodeAdapter>[0];
//# sourceMappingURL=code.d.ts.map