export interface PasswordHasher<T> {
    hash(password: string): Promise<T>;
    verify(password: string, compare: T): Promise<boolean>;
}
export interface PasswordConfig {
    length?: number;
    hasher?: PasswordHasher<any>;
    login: (req: Request, form?: FormData, error?: PasswordLoginError) => Promise<Response>;
    register: (req: Request, state: PasswordRegisterState, form?: FormData, error?: PasswordRegisterError) => Promise<Response>;
    change: (req: Request, state: PasswordChangeState, form?: FormData, error?: PasswordChangeError) => Promise<Response>;
    sendCode: (email: string, code: string) => Promise<void>;
}
export type PasswordRegisterState = {
    type: "start";
} | {
    type: "code";
    code: string;
    email: string;
    password: string;
};
export type PasswordRegisterError = {
    type: "invalid_code";
} | {
    type: "email_taken";
} | {
    type: "invalid_email";
} | {
    type: "invalid_password";
} | {
    type: "password_mismatch";
};
export type PasswordChangeState = {
    type: "start";
    redirect: string;
} | {
    type: "code";
    code: string;
    email: string;
    redirect: string;
} | {
    type: "update";
    redirect: string;
    email: string;
};
export type PasswordChangeError = {
    type: "invalid_email";
} | {
    type: "invalid_code";
} | {
    type: "invalid_password";
} | {
    type: "password_mismatch";
};
export type PasswordLoginError = {
    type: "invalid_password";
} | {
    type: "invalid_email";
};
export declare function PasswordAdapter(config: PasswordConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        email: string;
    }>): void;
};
export declare function PBKDF2Hasher(opts?: {
    interations?: number;
}): PasswordHasher<{
    hash: string;
    salt: string;
    iterations: number;
}>;
export declare function ScryptHasher(opts?: {
    N?: number;
    r?: number;
    p?: number;
}): PasswordHasher<{
    hash: string;
    salt: string;
    N: number;
    r: number;
    p: number;
}>;
//# sourceMappingURL=password.d.ts.map