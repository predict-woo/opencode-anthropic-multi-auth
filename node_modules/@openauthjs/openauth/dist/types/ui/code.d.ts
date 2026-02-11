/** @jsxImportSource hono/jsx */
export declare function CodeUI(props: {
    sendCode: (claims: Record<string, string>, code: string) => Promise<void>;
}): {
    sendCode: (claims: Record<string, string>, code: string) => Promise<void>;
    length: number;
    request: (_req: Request, state: import("../adapter/code.js").CodeAdapterState, _form: FormData | undefined, error: import("../adapter/code.js").CodeAdapterError | undefined) => Promise<Response>;
};
//# sourceMappingURL=code.d.ts.map