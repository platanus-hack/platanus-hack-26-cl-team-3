const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

async function verifyScan(url) {
  const browser = await chromium.launch({
    executablePath: process.env.CAPO_CHROME,
    args: ['--use-fake-device-for-media-stream'],
  });
  try {
    const context = await browser.newContext({ permissions: ['camera'] });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole('button', { name: 'Entendido' }).click();
    await page.getByRole('button', { name: 'Escanear capó' }).click();
    await page.getByRole('button', { name: 'Activar cámara' }).click();
    // A finite score requires a successful forward pass through the bundled model.
    await page.locator('#camera-status').filter({ hasText: /Confianza \d+ %/ }).waitFor({ timeout: 90000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      }
    });
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Activar cámara' }).click();
    await page.locator('#camera-status').filter({ hasText: /Confianza \d+ %/ }).waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: 'Volver al menú' }).click();
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
  } finally {
    await browser.close();
  }
}

verifyScan(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
