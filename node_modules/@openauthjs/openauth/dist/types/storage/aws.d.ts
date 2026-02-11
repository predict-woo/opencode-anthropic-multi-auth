import { AwsClient } from "aws4fetch";
export declare function client(): Promise<AwsClient>;
export type AwsOptions = Exclude<Parameters<AwsClient["fetch"]>[1], null | undefined>["aws"];
//# sourceMappingURL=aws.d.ts.map