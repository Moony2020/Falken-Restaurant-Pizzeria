import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import type { PaymentsConfig } from "./payments-config.ts";

export type SwishPaymentStatus = "PAID" | "DECLINED" | "ERROR" | "CANCELLED" | "CREATED";

export type SwishPaymentInfo = {
  id: string; // instructionUUID
  paymentReference?: string;
  paymentRequestToken?: string;
  status: SwishPaymentStatus;
  amount: number;
  currency: string;
  payeeAlias: string;
  payeePaymentReference: string;
  message?: string;
  dateCreated?: string;
  datePaid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  location?: string;
};

export type CreateSwishPaymentInput = {
  instructionUUID: string;
  payeePaymentReference: string;
  callbackUrl: string;
  amountSek: number;
  message: string;
};

export interface SwishGateway {
  createPaymentRequest(input: CreateSwishPaymentInput): Promise<SwishPaymentInfo>;
  retrievePaymentRequest(instructionUUID: string): Promise<SwishPaymentInfo>;
}

export type SwishGatewayTransport = {
  host: string;
  port: number;
  protocol: "http" | "https";
};

export function createSwishGateway(
  config: NonNullable<PaymentsConfig["swish"]>,
  transport: SwishGatewayTransport | null = null,
): SwishGateway {
  let agent: https.Agent | null = null;

  function getAgent(): https.Agent {
    if (agent) return agent;

    const certPath = path.resolve(process.cwd(), config.certPath);
    const keyPath = path.resolve(process.cwd(), config.keyPath);
    const caPath = path.resolve(process.cwd(), config.caPath);

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath) || !fs.existsSync(caPath)) {
      throw new Error(`Swish certificates not found. Checked: ${certPath}, ${keyPath}, ${caPath}`);
    }

    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const ca = fs.readFileSync(caPath);

    agent = new https.Agent({
      cert,
      key,
      ca,
      passphrase: config.passphrase,
    });
    return agent;
  }

  const base = new URL(transport ? `${transport.protocol}://${transport.host}:${transport.port}` : config.baseUrl);

  return {
    async createPaymentRequest(input: CreateSwishPaymentInput): Promise<SwishPaymentInfo> {
      const payload = JSON.stringify({
        payeePaymentReference: input.payeePaymentReference,
        callbackUrl: input.callbackUrl,
        payeeAlias: config.payeeAlias,
        amount: input.amountSek.toFixed(2),
        currency: "SEK",
        message: input.message.slice(0, 50),
      });

      return new Promise<SwishPaymentInfo>((resolve, reject) => {
        const isHttp = base.protocol === "http:";
        const httpModule = isHttp ? http : https;
        const req = httpModule.request(
          {
            protocol: base.protocol,
            hostname: base.hostname,
            port: base.port || (isHttp ? 80 : 443),
            path: `/swish-cpcapi/api/v2/paymentrequests/${input.instructionUUID}`,
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
            agent: isHttp ? undefined : getAgent(),
          },
          (res: import("node:http").IncomingMessage) => {
            let body = "";
            res.on("data", (chunk: Buffer) => {
              body += chunk.toString("utf8");
            });
            res.on("end", () => {
              if (res.statusCode === 201) {
                const token = (res.headers["paymentrequesttoken"] as string | undefined) ?? "";
                const location = (res.headers["location"] as string | undefined) ?? "";
                resolve({
                  id: input.instructionUUID,
                  paymentRequestToken: token,
                  status: "CREATED",
                  amount: input.amountSek,
                  currency: "SEK",
                  payeeAlias: config.payeeAlias,
                  payeePaymentReference: input.payeePaymentReference,
                  location,
                });
              } else {
                let errDetail = body;
                try {
                  const parsed = JSON.parse(body);
                  errDetail = parsed.map?.((p: { errorMessage: string }) => p.errorMessage).join(", ") || body;
                } catch {
                  // Keep raw body
                }
                reject(new Error(`Swish API error ${res.statusCode}: ${errDetail}`));
              }
            });
          },
        );

        req.on("error", (err: Error) => reject(err));
        req.write(payload);
        req.end();
      });
    },

    async retrievePaymentRequest(instructionUUID: string): Promise<SwishPaymentInfo> {
      return new Promise<SwishPaymentInfo>((resolve, reject) => {
        const isHttp = base.protocol === "http:";
        const httpModule = isHttp ? http : https;
        const req = httpModule.request(
          {
            protocol: base.protocol,
            hostname: base.hostname,
            port: base.port || (isHttp ? 80 : 443),
            path: `/swish-cpcapi/api/v1/paymentrequests/${instructionUUID}`,
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            agent: isHttp ? undefined : getAgent(),
          },
          (res: import("node:http").IncomingMessage) => {
            let body = "";
            res.on("data", (chunk: Buffer) => {
              body += chunk.toString("utf8");
            });
            res.on("end", () => {
              if (res.statusCode === 200) {
                try {
                  const data = JSON.parse(body);
                  resolve({
                    id: data.id ?? instructionUUID,
                    paymentReference: data.paymentReference,
                    status: data.status,
                    amount: typeof data.amount === "number" ? data.amount : Number(data.amount),
                    currency: data.currency ?? "SEK",
                    payeeAlias: data.payeeAlias ?? config.payeeAlias,
                    payeePaymentReference: data.payeePaymentReference,
                    message: data.message,
                    dateCreated: data.dateCreated,
                    datePaid: data.datePaid,
                    errorCode: data.errorCode,
                    errorMessage: data.errorMessage,
                  });
                } catch (e) {
                  reject(new Error(`Malformed Swish payment JSON: ${(e as Error).message}`));
                }
              } else {
                reject(new Error(`Failed to retrieve Swish payment ${instructionUUID}: status ${res.statusCode} ${body}`));
              }
            });
          },
        );

        req.on("error", (err: Error) => reject(err));
        req.end();
      });
    },
  };
}

let cachedGateway: SwishGateway | null = null;
export function getSwishGateway(config: PaymentsConfig): SwishGateway | null {
  if (!config.swish || !config.enabled) return null;
  return (cachedGateway ??= createSwishGateway(config.swish));
}
