/** @jsxImportSource hono/jsx */
import { PasswordChangeError, PasswordConfig, PasswordLoginError, PasswordRegisterError } from "../adapter/password.js";
import "./form.js";
declare const DEFAULT_COPY: {
    error_email_taken: string;
    error_invalid_code: string;
    error_invalid_email: string;
    error_invalid_password: string;
    error_password_mismatch: string;
    register_title: string;
    register_description: string;
    login_title: string;
    login_description: string;
    register: string;
    register_prompt: string;
    login_prompt: string;
    login: string;
    change_prompt: string;
    code_resend: string;
    code_return: string;
    logo: string;
    input_email: string;
    input_password: string;
    input_code: string;
    input_repeat: string;
    button_continue: string;
};
export type PasswordUICopy = typeof DEFAULT_COPY;
export interface PasswordUIOptions {
    sendCode: PasswordConfig["sendCode"];
    copy?: Partial<PasswordUICopy>;
}
export declare function PasswordUI(input: PasswordUIOptions): {
    sendCode: (email: string, code: string) => Promise<void>;
    login: (_req: Request, form: FormData | undefined, error: PasswordLoginError | undefined) => Promise<Response>;
    register: (_req: Request, state: import("../adapter/password.js").PasswordRegisterState, form: FormData | undefined, error: PasswordRegisterError | undefined) => Promise<Response>;
    change: (_req: Request, state: import("../adapter/password.js").PasswordChangeState, form: FormData | undefined, error: PasswordChangeError | undefined) => Promise<Response>;
};
export {};
//# sourceMappingURL=password.d.ts.map