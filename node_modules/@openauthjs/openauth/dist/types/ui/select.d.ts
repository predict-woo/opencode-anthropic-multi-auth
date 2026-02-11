/** @jsxImportSource hono/jsx */
export interface SelectProps {
    providers?: Record<string, {
        hide?: boolean;
        display?: string;
    }>;
}
export declare function Select(props?: SelectProps): (providers: Record<string, string>, _req: Request) => Promise<Response>;
//# sourceMappingURL=select.d.ts.map