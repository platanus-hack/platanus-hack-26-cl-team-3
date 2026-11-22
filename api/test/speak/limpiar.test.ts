import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarParaVoz } from "../../src/speak/limpiar";

test("quita markdown, viñetas, enlaces, URLs y referencias, y colapsa espacios", () => {
  assert.equal(limpiarParaVoz("**Revisa** el __nivel__ del `aceite`"), "Revisa el nivel del aceite");
  assert.equal(limpiarParaVoz("## Paso 1\n- abre el capó\n* busca la varilla\n• límpiala"), "Paso 1 abre el capó busca la varilla límpiala");
  assert.equal(limpiarParaVoz("Mira [el manual](https://ejemplo.cl/manual) ahora"), "Mira el manual ahora");
  assert.equal(limpiarParaVoz("Más en https://ejemplo.cl/x?a=1 y listo"), "Más en y listo");
  assert.equal(limpiarParaVoz("Usa 5W-30 [1] siempre [2]."), "Usa 5W-30 siempre.");
  assert.equal(limpiarParaVoz("  hola \n\n  mundo\t  "), "hola mundo");
  assert.equal(limpiarParaVoz("**  **"), "");
});
