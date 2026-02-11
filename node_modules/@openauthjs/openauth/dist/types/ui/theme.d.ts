export type ColorScheme = {
    dark: string;
    light: string;
};
export interface Theme {
    title?: string;
    favicon?: string;
    radius?: "none" | "sm" | "md" | "lg" | "full";
    primary: string | ColorScheme;
    background?: string | ColorScheme;
    logo?: string | ColorScheme;
    font?: {
        family?: string;
        scale?: string;
    };
    css?: string;
}
export declare const THEME_TERMINAL: Theme;
export declare const THEME_SST: Theme;
export declare const THEME_SUPABASE: Theme;
export declare const THEME_VERCEL: Theme;
export declare function setTheme(value: Theme): void;
export declare function getTheme(): any;
//# sourceMappingURL=theme.d.ts.map