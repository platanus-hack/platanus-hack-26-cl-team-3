import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { toProviderError } from "../../src/llm/anthropic";
import { ProviderError } from "../../src/llm/errors";

const api = (status: number | undefined, body: unknown) => Anthropic.APIError.generate(status, body as object, "raw sdk text", new Headers());

test("status 402 maps to credit with the fixed message", () => {
  const e = toProviderError(api(402, { error: { message: "x" } }));
  assert.ok(e instanceof ProviderError);
  assert.equal(e.code, "credit");
  assert.equal(e.message, "Se acabó el crédito de la key de Anthropic.");
});

test("billing_error type maps to credit, nested or flat", () => {
  assert.equal(toProviderError(api(400, { type: "error", error: { type: "billing_error" } })).code, "credit");
  assert.equal(toProviderError(api(400, { type: "billing_error" })).code, "credit");
});

test("other API errors and unknown errors map to provider with the fixed message", () => {
  for (const e of [api(500, { error: { type: "api_error" } }), new Error("boom"), "x"]) {
    const p = toProviderError(e);
    assert.equal(p.code, "provider");
    assert.equal(p.message, "El proveedor del modelo falló. Inténtalo de nuevo.");
  }
});
