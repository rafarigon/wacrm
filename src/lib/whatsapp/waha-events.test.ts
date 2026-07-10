import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import {
  mapAckToStatus,
  translateWahaEvent,
  verifyWahaWebhookSignature,
  type WahaWebhookEvent,
} from "./waha-events";

const inboundText = (
  overrides: Record<string, unknown> = {},
): WahaWebhookEvent => ({
  event: "message",
  session: "default",
  payload: {
    id: "false_5541992884412@c.us_ABC123",
    timestamp: 1767990000,
    from: "5541992884412@c.us",
    fromMe: false,
    body: "Olá, tenho interesse no apartamento",
    _data: { pushName: "Cliente Teste" },
    ...overrides,
  },
});

describe("translateWahaEvent — inbound text", () => {
  it("translates a WAHA text message into the Meta shape", () => {
    const result = translateWahaEvent(inboundText());
    expect(result.kind).toBe("message");
    if (result.kind !== "message") return;
    expect(result.message).toMatchObject({
      id: "false_5541992884412@c.us_ABC123",
      from: "5541992884412",
      timestamp: "1767990000",
      type: "text",
      text: { body: "Olá, tenho interesse no apartamento" },
    });
    expect(result.contact).toEqual({
      profile: { name: "Cliente Teste" },
      wa_id: "5541992884412",
    });
  });

  it("maps swipe-reply context from payload.replyTo object", () => {
    const result = translateWahaEvent(
      inboundText({ replyTo: { id: "PARENT1", body: "quoted" } }),
    );
    if (result.kind !== "message") throw new Error("expected message");
    expect(result.message.context).toEqual({ id: "PARENT1" });
  });

  it("accepts legacy string replyTo", () => {
    const result = translateWahaEvent(inboundText({ replyTo: "PARENT2" }));
    if (result.kind !== "message") throw new Error("expected message");
    expect(result.message.context).toEqual({ id: "PARENT2" });
  });

  it("ignores fromMe echoes", () => {
    const result = translateWahaEvent(inboundText({ fromMe: true }));
    expect(result).toEqual({
      kind: "ignored",
      reason: "own outbound echo (fromMe)",
    });
  });

  it("ignores group messages", () => {
    const result = translateWahaEvent(
      inboundText({ from: "123456789-987654@g.us" }),
    );
    expect(result.kind).toBe("ignored");
  });

  it("ignores unknown event types", () => {
    const result = translateWahaEvent({
      event: "session.status",
      session: "default",
      payload: { status: "WORKING" },
    });
    expect(result.kind).toBe("ignored");
  });
});

describe("translateWahaEvent — media", () => {
  it("carries WAHA media on direct_media and types by mimetype", () => {
    const result = translateWahaEvent(
      inboundText({
        body: "Segue a foto",
        media: {
          url: "http://waha:3000/api/files/default/x.jpg",
          mimetype: "image/jpeg",
          filename: null,
        },
      }),
    );
    if (result.kind !== "message") throw new Error("expected message");
    expect(result.message.type).toBe("image");
    expect(result.message.direct_media).toEqual({
      url: "http://waha:3000/api/files/default/x.jpg",
      mime_type: "image/jpeg",
      caption: "Segue a foto",
      filename: undefined,
    });
  });

  it("falls back to document for unknown mimetypes", () => {
    const result = translateWahaEvent(
      inboundText({
        body: "",
        media: {
          url: "http://waha:3000/api/files/default/tabela.pdf",
          mimetype: "application/pdf",
          filename: "tabela.pdf",
        },
      }),
    );
    if (result.kind !== "message") throw new Error("expected message");
    expect(result.message.type).toBe("document");
    expect(result.message.direct_media?.filename).toBe("tabela.pdf");
  });
});

describe("translateWahaEvent — reactions", () => {
  it("translates message.reaction into Meta's type='reaction'", () => {
    const result = translateWahaEvent({
      event: "message.reaction",
      session: "default",
      payload: {
        id: "false_5541992884412@c.us_R1",
        timestamp: 1767990100,
        from: "5541992884412@c.us",
        fromMe: false,
        reaction: { text: "❤️", messageId: "true_5541992884412@c.us_T1" },
      },
    });
    if (result.kind !== "message") throw new Error("expected message");
    expect(result.message.type).toBe("reaction");
    expect(result.message.reaction).toEqual({
      message_id: "true_5541992884412@c.us_T1",
      emoji: "❤️",
    });
  });
});

describe("translateWahaEvent — acks", () => {
  it("maps a READ ack on an outbound message to a status update", () => {
    const result = translateWahaEvent({
      event: "message.ack",
      session: "default",
      payload: {
        id: "true_5541992884412@c.us_T1",
        from: "5541992884412@c.us",
        fromMe: true,
        ack: 3,
        ackName: "READ",
      },
    });
    expect(result.kind).toBe("status");
    if (result.kind !== "status") return;
    expect(result.status.id).toBe("true_5541992884412@c.us_T1");
    expect(result.status.status).toBe("read");
    expect(result.status.recipient_id).toBe("5541992884412");
  });

  it("ignores PENDING acks", () => {
    const result = translateWahaEvent({
      event: "message.ack",
      session: "default",
      payload: { id: "x", fromMe: true, ack: 0, ackName: "PENDING" },
    });
    expect(result.kind).toBe("ignored");
  });
});

describe("mapAckToStatus", () => {
  it.each([
    ["ERROR", -1, "failed"],
    ["SERVER", 1, "sent"],
    ["DEVICE", 2, "delivered"],
    ["READ", 3, "read"],
    ["PLAYED", 4, "read"],
  ] as const)("maps %s to %s", (name, num, expected) => {
    expect(mapAckToStatus(num, name)).toBe(expected);
    expect(mapAckToStatus(num, undefined)).toBe(expected);
    expect(mapAckToStatus(undefined, name)).toBe(expected);
  });

  it("returns null for pending/unknown", () => {
    expect(mapAckToStatus(0, "PENDING")).toBeNull();
    expect(mapAckToStatus(undefined, undefined)).toBeNull();
  });
});

describe("verifyWahaWebhookSignature", () => {
  const KEY = "test-hmac-key";
  const BODY = '{"event":"message"}';
  const sign = (body: string, key: string) =>
    crypto.createHmac("sha512", key).update(body).digest("hex");

  beforeEach(() => {
    vi.stubEnv("WAHA_WEBHOOK_HMAC_KEY", KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a valid sha512 signature", () => {
    expect(verifyWahaWebhookSignature(BODY, sign(BODY, KEY))).toBe(true);
  });

  it("rejects a signature made with the wrong key", () => {
    expect(verifyWahaWebhookSignature(BODY, sign(BODY, "other"))).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyWahaWebhookSignature('{"event":"hacked"}', sign(BODY, KEY)),
    ).toBe(false);
  });

  it("rejects when the header is missing", () => {
    expect(verifyWahaWebhookSignature(BODY, null)).toBe(false);
  });

  it("fails closed when the env key is not configured", () => {
    vi.stubEnv("WAHA_WEBHOOK_HMAC_KEY", "");
    expect(verifyWahaWebhookSignature(BODY, sign(BODY, KEY))).toBe(false);
  });
});
