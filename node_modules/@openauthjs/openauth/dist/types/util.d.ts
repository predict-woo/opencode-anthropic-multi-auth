import { Context } from "hono";
export type Prettify<T> = {
    [K in keyof T]: T[K];
};
export declare function getRelativeUrl(ctx: Context, path: string): string;
export declare function isDomainMatch(a: string, b: string): boolean;
//# sourceMappingURL=util.d.ts.map