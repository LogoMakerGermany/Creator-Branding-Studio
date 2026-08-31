/**
 * After Dev-Login a new user is sent to /onboarding.
 *
 * A–I regression: mark onboarding complete via API without creating DNA,
 * so existing "no DNA yet" assertions stay valid.
 * Phase J: pass { createDna: true } to run the real wizard (DNA + complete).
 */
export async function completeOnboardingIfNeeded(page, options = {}) {
  const createDna = Boolean(options.createDna);
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 25000 });
  if (!/\/onboarding/.test(page.url())) {
    return;
  }

  if (!createDna) {
    const res = await page.evaluate(async () => {
      const token = localStorage.getItem('auth_token');
      const r = await fetch('/api/v1/auth/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const json = await r.json().catch(() => ({}));
      return { status: r.status, json };
    });
    if (res.status >= 400) {
      throw new Error(`onboarding/complete failed: ${res.status} ${JSON.stringify(res.json)}`);
    }
    await page.goto(new URL('/dashboard', page.url()).toString());
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    return;
  }

  const nameInput = page.locator('#onboarding-name');
  if (await nameInput.isVisible().catch(() => false)) {
    const current = await nameInput.inputValue();
    if (!current || current.trim().length < 2) {
      await nameInput.fill('E2E Creator');
    }
  }

  for (let i = 0; i < 10; i++) {
    const finish = page.getByTestId('onboarding-finish');
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      await page.waitForURL(/\/dashboard/, { timeout: 40000 });
      return;
    }
    const next = page.getByTestId('onboarding-next');
    await next.click();
    await page.waitForTimeout(60);
  }

  throw new Error(`Onboarding wizard did not finish (url=${page.url()})`);
}
