import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatIdFromPhone,
  getLidPhoneNumber,
  sendTextMessage,
  sendMediaMessage,
  setReaction,
} from "./waha-api";

const BASE_ARGS = {
  baseUrl: "http://waha.local:3001",
  apiKey: "test-key",
  session: "default",
  to: "+55 41 99288-4412",
} as const;

// Resolves like a WAHA 201 with a NOWEB-shaped message (id under key.id).
const okJson = (payload: unknown): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("chatIdFromPhone", () => {
  it("strips formatting and appends @c.us", () => {
    expect(chatIdFromPhone("+55 41 99288-4412")).toBe("5541992884412@c.us");
  });

  it("keeps already-bare digits untouched", () => {
    expect(chatIdFromPhone("5541992884412")).toBe("5541992884412@c.us");
  });
});

describe("sendTextMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ key: { id: "ABCDEF123" } })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty text before any network call", async () => {
    await expect(
      sendTextMessage({ ...BASE_ARGS, text: "" }),
    ).rejects.toThrow(/requires text/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POSTs to /api/sendText with session, chatId and X-Api-Key", async () => {
    const result = await sendTextMessage({ ...BASE_ARGS, text: "Olá" });

    expect(result.messageId).toBe("ABCDEF123");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local:3001/api/sendText");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      session: "default",
      chatId: "5541992884412@c.us",
      text: "Olá",
    });
  });

  it("adds reply_to when contextMessageId is set", async () => {
    await sendTextMessage({ ...BASE_ARGS, text: "Oi", contextMessageId: "MSG1" });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).reply_to).toBe("MSG1");
  });

  it("tolerates a trailing slash on baseUrl", async () => {
    await sendTextMessage({ ...BASE_ARGS, baseUrl: "http://waha.local:3001/", text: "Oi" });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe("http://waha.local:3001/api/sendText");
  });

  it("extracts WEBJS-shaped ids (id._serialized)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => okJson({ id: { _serialized: "true_554199@c.us_AAA" } })),
    );
    const result = await sendTextMessage({ ...BASE_ARGS, text: "Oi" });
    expect(result.messageId).toBe("true_554199@c.us_AAA");
  });

  it("surfaces the WAHA error message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "Session not found" }), {
            status: 404,
          }),
        ),
      ),
    );
    await expect(
      sendTextMessage({ ...BASE_ARGS, text: "Oi" }),
    ).rejects.toThrow("Session not found");
  });
});

describe("sendMediaMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ id: "MEDIA1" })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a missing link before any network call", async () => {
    await expect(
      sendMediaMessage({ ...BASE_ARGS, kind: "image", link: "" }),
    ).rejects.toThrow(/requires a link/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["image", "/api/sendImage"],
    ["video", "/api/sendVideo"],
    ["document", "/api/sendFile"],
  ] as const)("routes kind=%s to %s", async (kind, path) => {
    await sendMediaMessage({
      ...BASE_ARGS,
      kind,
      link: "https://cdn.example.com/x",
    });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe(`http://waha.local:3001${path}`);
  });

  it("sends filename only for documents", async () => {
    await sendMediaMessage({
      ...BASE_ARGS,
      kind: "document",
      link: "https://cdn.example.com/tabela.pdf",
      filename: "tabela.pdf",
      caption: "Tabela de preços",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.file).toEqual({
      url: "https://cdn.example.com/tabela.pdf",
      filename: "tabela.pdf",
    });
    expect(body.caption).toBe("Tabela de preços");
  });
});

describe("getLidPhoneNumber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a LID to the real chat id via /api/{session}/lids/{lid}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        okJson({ lid: "786113278038@lid", pn: "554192882468@c.us" }),
      ),
    );
    const pn = await getLidPhoneNumber({
      ...BASE_ARGS,
      lid: "786113278038@lid",
    });
    expect(pn).toBe("554192882468@c.us");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://waha.local:3001/api/default/lids/786113278038%40lid",
    );
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("test-key");
  });

  it("returns null when the mapping is unknown (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
    );
    expect(
      await getLidPhoneNumber({ ...BASE_ARGS, lid: "999@lid" }),
    ).toBeNull();
  });

  it("returns null for an empty lid without a network call", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await getLidPhoneNumber({ ...BASE_ARGS, lid: "" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("setReaction", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => okJson(null)));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs to /api/reaction with the target message id", async () => {
    await setReaction({ ...BASE_ARGS, messageId: "MSG9", emoji: "👍" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local:3001/api/reaction");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      session: "default",
      messageId: "MSG9",
      reaction: "👍",
    });
  });

  it("rejects a missing messageId before any network call", async () => {
    await expect(
      setReaction({ ...BASE_ARGS, messageId: "", emoji: "👍" }),
    ).rejects.toThrow(/requires messageId/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
