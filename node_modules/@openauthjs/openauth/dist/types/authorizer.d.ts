import { Adapter } from "./adapter/adapter.js";
import { SubjectPayload, SubjectSchema } from "./session.js";
import { Hono } from "hono/tiny";
export interface OnSuccessResponder<T extends {
    type: string;
    properties: any;
}> {
    subject<Type extends T["type"]>(type: Type, properties: Extract<T, {
        type: Type;
    }>["properties"]): Promise<Response>;
}
interface AuthorizationState {
    redirect_uri: string;
    response_type: string;
    state: string;
    client_id: string;
    audience?: string;
    pkce?: {
        challenge: string;
        method: "S256";
    };
}
export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
import { UnknownStateError } from "./error.js";
import { StorageAdapter } from "./storage/storage.js";
import { Theme } from "./ui/theme.js";
export declare const aws: <E extends import("hono").Env = import("hono").Env, S extends import("hono").Schema = {}, BasePath extends string = "/">(app: import("hono").Hono<E, S, BasePath>) => ((event: import("hono/aws-lambda").LambdaEvent, lambdaContext?: import("hono/aws-lambda").LambdaContext) => Promise<import("hono/aws-lambda").APIGatewayProxyResult>);
export declare function authorizer<Providers extends Record<string, Adapter<any>>, Subjects extends SubjectSchema, Result = {
    [key in keyof Providers]: Prettify<{
        provider: key;
    } & (Providers[key] extends Adapter<infer T> ? T : {})>;
}[keyof Providers]>(input: {
    subjects: Subjects;
    storage?: StorageAdapter;
    providers: Providers;
    theme?: Theme;
    ttl?: {
        access?: number;
        refresh?: number;
    };
    select?: (providers: Record<string, string>, req: Request) => Promise<Response>;
    start?(req: Request): Promise<void>;
    success(response: OnSuccessResponder<SubjectPayload<Subjects>>, input: Result, req: Request): Promise<Response>;
    error?(error: UnknownStateError, req: Request): Promise<Response>;
    allow?(input: {
        clientID: string;
        redirectURI: string;
        audience?: string;
    }, req: Request): Promise<boolean>;
}): Hono<{
    Variables: {
        authorization: AuthorizationState;
    };
}, import("hono/types").BlankSchema, "/">;
export {};
//# sourceMappingURL=authorizer.d.ts.map