import type { CreateSwishPaymentInput, SwishGateway, SwishPaymentInfo } from "../../src/server/swish-gateway.ts";

let counter = 0;

export class MockSwish implements SwishGateway {
  requests = new Map<string, SwishPaymentInfo>();
  createCalls = 0;
  retrieveCalls = 0;
  failNetwork = false;

  async createPaymentRequest(input: CreateSwishPaymentInput): Promise<SwishPaymentInfo> {
    this.createCalls++;
    if (this.failNetwork) throw new Error("Swish network error");

    const token = `mock_token_${++counter}`;
    const info: SwishPaymentInfo = {
      id: input.instructionUUID,
      paymentRequestToken: token,
      status: "CREATED",
      amount: input.amountSek,
      currency: "SEK",
      payeeAlias: "1234679304",
      payeePaymentReference: input.payeePaymentReference,
      message: input.message,
      dateCreated: new Date().toISOString(),
      location: `https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/${input.instructionUUID}`,
    };
    this.requests.set(input.instructionUUID, info);
    return info;
  }

  async retrievePaymentRequest(instructionUUID: string): Promise<SwishPaymentInfo> {
    this.retrieveCalls++;
    if (this.failNetwork) throw new Error("Swish network error");

    const req = this.requests.get(instructionUUID);
    if (!req) throw new Error(`Swish payment ${instructionUUID} not found`);
    return req;
  }

  pay(instructionUUID: string, paymentReference = `PAYREF_${++counter}`) {
    const req = this.requests.get(instructionUUID);
    if (!req) throw new Error(`Cannot pay non-existent request: ${instructionUUID}`);
    req.status = "PAID";
    req.paymentReference = paymentReference;
    req.datePaid = new Date().toISOString();
  }

  decline(instructionUUID: string, errorCode = "RF07", errorMessage = "Transaction declined") {
    const req = this.requests.get(instructionUUID);
    if (!req) throw new Error(`Cannot decline non-existent request: ${instructionUUID}`);
    req.status = "DECLINED";
    req.errorCode = errorCode;
    req.errorMessage = errorMessage;
  }

  cancel(instructionUUID: string) {
    const req = this.requests.get(instructionUUID);
    if (!req) throw new Error(`Cannot cancel non-existent request: ${instructionUUID}`);
    req.status = "CANCELLED";
    req.errorMessage = "Cancelled by user";
  }

  tamperAmount(instructionUUID: string, badAmount: number) {
    const req = this.requests.get(instructionUUID);
    if (!req) throw new Error(`Cannot tamper non-existent request: ${instructionUUID}`);
    req.amount = badAmount;
  }
}

