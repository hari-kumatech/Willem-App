import { expect, test } from '@playwright/test';
import { createDbClient, serviceToken } from '../src/lib/db';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const db = createDbClient(process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331', serviceToken(process.env.AUTH_JWT_SECRET!));

const EMAIL = 'e2e-admin@mek.local';
const PASSWORD = 'E2e-test-password-1';
const PROFILE = `E2E Helmond ${Date.now()}`;
let userId = '';

test.beforeAll(async () => {
  const { data: old } = await db.from('profiles').select('id').eq('email', EMAIL).maybeSingle();
  if (old) await db.rpc('auth_delete_user', { p_user: old.id });
  const created = await db.rpc('auth_create_user', { p_email: EMAIL, p_password: PASSWORD, p_meta: { name: 'E2E Admin', role: 'admin' } });
  userId = created.data as string;
  await db.from('profiles').update({ role: 'admin' }).eq('id', userId);
  // Fresh test data: sample companies (mock / demo) and earlier e2e profiles
  await db.from('companies').delete().or('place_id.like.mock-%,place_id.like.demo-%');
  await db.from('search_profiles').delete().like('name', 'E2E %');
});

test.afterAll(async () => {
  if (userId) await db.rpc('auth_delete_user', { p_user: userId });
});

test('run → review → approve → lead → quote PDF', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/overzicht/);
  await expect(page.getByRole('heading', { name: /Heel Nederland/i })).toBeVisible();

  // New search profile around Helmond, 10 km
  await page.goto('/radar/profiles/new');
  await page.getByLabel('Naam', { exact: true }).fill(PROFILE);
  await page.getByLabel('Postcode (PC4 of PC6)').fill('5701');
  await page.getByRole('button', { name: '10 km' }).click();
  await page.getByRole('button', { name: 'Profiel opslaan' }).click();
  await expect(page).toHaveURL(/tab=profiles/);

  // Start the run and wait until it is done (n8n + Apify or the mocks)
  const card = page.locator('section', { hasText: PROFILE });
  await card.getByRole('button', { name: 'Nu zoeken' }).click();
  await expect(page).toHaveURL(/\/radar\/runs\//, { timeout: 60_000 });
  await expect(page.getByText(/^(Klaar|Budget bereikt)$/)).toBeVisible({ timeout: 6 * 60_000 });

  // Review queue: the best company is on top, with a score, reasons and evidence
  await page.goto('/radar');
  const first = page.locator('section').filter({ has: page.getByRole('button', { name: 'Goedkeuren → lead' }) }).first();
  await expect(first.getByText('Redenen')).toBeVisible();
  const name = (await first.locator('h2').first().textContent())!.trim();
  await first.getByRole('button', { name: 'Goedkeuren → lead' }).click();
  await expect(page.getByText(`${name} staat nu in de pijplijn als nieuw prospect.`)).toBeVisible();

  // The lead exists in the pipeline
  await page.goto(`/leads?q=${encodeURIComponent(name.split(' ')[0])}`);
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Quote: ROI wizard from the lead, save → numbered quote + PDF download
  await page.getByRole('link', { name: 'Maak offerte (ROI)' }).click();
  await expect(page).toHaveURL(/\/roi\?lead=/);
  const email = page.getByLabel(/E-mailadres/);
  if (!(await email.inputValue())) await email.fill('inkoop@voorbeeld.example');
  await page.getByRole('button', { name: 'Volgende: Efficiëntie' }).click();
  await expect(page.getByText('18,8%').first()).toBeVisible();
  await page.getByRole('button', { name: 'Volgende: Kosten' }).click();
  await page.getByRole('button', { name: 'Vergelijk alle opties' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Offerte opslaan & PDF maken' }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await expect(page.getByText(/Offerte MEK-\d{4}-\d{4} opgeslagen/)).toBeVisible();

  // The quote is on the lead's activity / quotes
  await page.goBack();
  await page.goto('/roi/offertes');
  await expect(page.getByText(/MEK-\d{4}-\d{4}/).first()).toBeVisible();

  // Demo: 3D product view renders without the WebGL error panel
  await page.goto('/demo?tab=product');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/De 3D-weergave kon niet worden geladen/)).toHaveCount(0);

  // Language switch: English UI
  await page.getByRole('button', { name: 'en', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'nl', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Overzicht' })).toBeVisible();
});
