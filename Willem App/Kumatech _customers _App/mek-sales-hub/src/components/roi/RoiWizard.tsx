'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, FileDown, FileText, Link2, Mail, Unlink } from 'lucide-react';
import { Button, Card, CardHeader, Notice, cx } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { roi } from '@/i18n/messages/roi';
import { euro, fmtTime, num } from '@/lib/format';
import { saveQuote } from '@/modules/roi/actions';
import {
  KOOP_CHART_MONTHS,
  computeRoi,
  defaultInputs,
  recurringChartMonths,
  summarize,
  type CostModel,
  type QuoteModel,
  type RoiInputs,
  type RoiSettings,
} from '@/modules/roi/calc';
import { KoopChart, RecurringChart } from './charts';
import { comparisonHead, comparisonRows, effLabel, netLabel, paybackLabel } from './fmt';
import { downloadComparisonPdf, downloadQuotePdf } from './pdf';

export interface LeadOption {
  id: string;
  bedrijf: string;
  contact: string;
  email: string;
  tel: string;
  hall: { lengthM?: number; widthM?: number } | null;
}

interface Props {
  settings: RoiSettings;
  canSave: boolean; // admin + sales
  showMargin: boolean; // admin + sales; the panel is also .internal-only for presentation mode
  initialLead: LeadOption | null;
  leadNotFound: boolean;
  leads: LeadOption[]; // searchable list when no lead is linked yet
}

type Step = 1 | 2 | 3 | 4;
type Status = { tone: 'positive' | 'warning'; text: string } | null;

interface CustomerState {
  naam: string;
  bedrijf: string;
  email: string;
  telefoon: string;
}

// Snap a hall dimension to the slider range (5–200, step 5)
const snap5 = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(200, Math.max(5, Math.round(n / 5) * 5)) : fallback;
};

function withLead(inputs: RoiInputs, lead: LeadOption | null): RoiInputs {
  if (!lead?.hall) return inputs;
  return {
    ...inputs,
    route: { ...inputs.route, lengthM: snap5(lead.hall.lengthM, inputs.route.lengthM), widthM: snap5(lead.hall.widthM, inputs.route.widthM) },
  };
}

const customerOf = (lead: LeadOption | null): CustomerState => ({
  naam: lead?.contact ?? '',
  bedrijf: lead?.bedrijf ?? '',
  email: lead?.email ?? '',
  telefoon: lead?.tel ?? '',
});

export function RoiWizard({ settings, canSave, showMargin, initialLead, leadNotFound, leads }: Props) {
  const t = useMessages(roi);
  const lang = useLang();
  const e = (v: number, digits = 0) => euro(v, digits, lang);

  const [step, setStep] = useState<Step>(1);
  const [lead, setLead] = useState<LeadOption | null>(initialLead);
  const [leadQuery, setLeadQuery] = useState('');
  const [customer, setCustomer] = useState<CustomerState>(() => customerOf(initialLead));
  const [emailError, setEmailError] = useState(false);
  const [inputs, setInputs] = useState<RoiInputs>(() => withLead(defaultInputs(settings), initialLead));
  const [mode, setMode] = useState<CostModel>('koop');
  const [allOptions, setAllOptions] = useState(true);
  const [offerModel, setOfferModel] = useState<CostModel>('koop');
  const [trucks, setTrucks] = useState(1);
  const [busy, setBusy] = useState<'quote' | 'pdf' | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<Status>(null);
  const [pdfStatus, setPdfStatus] = useState<Status>(null);
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  // The single source of truth for every figure on every step and in both PDFs
  const result = useMemo(() => computeRoi(inputs), [inputs]);
  const { route, savings, koop, lease, aas, margin } = result;

  const set = (patch: Partial<RoiInputs>) => setInputs((prev) => ({ ...prev, ...patch }));
  const setRoute = (patch: Partial<RoiInputs['route']>) => setInputs((prev) => ({ ...prev, route: { ...prev.route, ...patch } }));
  const setLease = (patch: Partial<RoiInputs['lease']>) => setInputs((prev) => ({ ...prev, lease: { ...prev.lease, ...patch } }));
  const setAas = (patch: Partial<RoiInputs['aas']>) => setInputs((prev) => ({ ...prev, aas: { ...prev.aas, ...patch } }));

  const emailValid = customer.email.trim().includes('@');

  function go(next: Step) {
    if (next > 1 && !emailValid) {
      setEmailError(true);
      setStep(1);
      return;
    }
    setEmailError(false);
    if (next === 4) setOfferModel(mode);
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseLead(id: string) {
    const chosen = leads.find((l) => l.id === id) ?? null;
    setLead(chosen);
    if (!chosen) return;
    // Fill only empty fields so typed details are kept
    setCustomer((prev) => ({
      naam: prev.naam || chosen.contact,
      bedrijf: prev.bedrijf || chosen.bedrijf,
      email: prev.email || chosen.email,
      telefoon: prev.telefoon || chosen.tel,
    }));
    setInputs((prev) => withLead(prev, chosen));
  }

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    const list = q ? leads.filter((l) => `${l.bedrijf} ${l.contact}`.toLowerCase().includes(q)) : leads;
    return list.slice(0, 200);
  }, [leads, leadQuery]);

  const customerPayload = () => ({ ...customer, lang });

  // ---- Mailto (real newlines: encodeURIComponent of "\n"-joined lines) ----
  function headline(): string {
    if (mode === 'koop') return Number.isFinite(koop.paybackExtraMonths) ? paybackLabel(koop.paybackExtraMonths, t, lang) : '–';
    return netLabel(mode === 'lease' ? lease.net : aas.net, t, lang);
  }
  function subline(): string {
    if (mode === 'koop') return savings.perMonth > 0 ? t.koopSub(e(koop.priceDiff), e(savings.perYear)) : t.noSavings;
    const net = mode === 'lease' ? lease.net : aas.net;
    const cost = mode === 'aas' ? t.costFee : lease.useDifference ? t.costLeaseDiff : t.costLease;
    return net > 0 ? t.recurringPositive(cost) : t.recurringNegative(cost);
  }
  function requestQuote() {
    const subject = t.mailSubject(customer.bedrijf || customer.naam || t.mailNew);
    const lines = [
      `${t.mailName}: ${customer.naam}`,
      `${t.mailCompany}: ${customer.bedrijf}`,
      `${t.mailEmail}: ${customer.email}`,
      `${t.mailPhone}: ${customer.telefoon}`,
      '',
      `${t.mailModel}: ${t.models[mode]}`,
      `${t.mailPrice}: ${e(koop.price)}`,
      `${t.mailEff}: ${effLabel(result.efficiency, lang)}`,
      `${t.mailSavings}: ${e(savings.perYear)}`,
      `${t.mailResult}: ${headline()} — ${subline()}`,
      '',
      t.mailFooter,
    ];
    const href = `mailto:${settings.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    setMailStatus(t.mailOpened);
    window.location.href = href;
  }

  // ---- Quote: number from the database first, then the PDF ----
  async function onSaveQuote() {
    const model: QuoteModel = allOptions ? 'alle' : offerModel;
    setBusy('quote');
    setQuoteStatus(null);
    try {
      let res;
      try {
        res = await saveQuote({
          leadId: lead?.id ?? null,
          model,
          trucks,
          inputs,
          results: summarize(result),
          customer: customerPayload(),
        });
      } catch {
        setQuoteStatus({ tone: 'warning', text: t.errNetwork });
        return;
      }
      if (!res.ok) {
        setQuoteStatus({ tone: 'warning', text: res.error });
        return;
      }
      try {
        await downloadQuotePdf({
          lang,
          number: res.number,
          date: new Date(),
          validDays: settings.quoteValidDays,
          vatPct: settings.vat,
          model,
          trucks,
          customer,
          inputs,
          contactEmail: settings.contactEmail,
        });
        setQuoteStatus({ tone: 'positive', text: t.quoteSaved(res.number) });
      } catch (error) {
        console.error(error);
        setQuoteStatus({ tone: 'warning', text: t.quoteSavedNoPdf(res.number) });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onComparisonPdf() {
    setBusy('pdf');
    setPdfStatus(null);
    try {
      await downloadComparisonPdf({ lang, customer, inputs, contactEmail: settings.contactEmail });
      setPdfStatus({ tone: 'positive', text: t.pdfDone });
    } catch (error) {
      console.error(error);
      setPdfStatus({ tone: 'warning', text: t.pdfFailed });
    } finally {
      setBusy(null);
    }
  }

  const stepLabels: Record<Step, string> = { 1: t.steps.s1, 2: t.steps.s2, 3: t.steps.s3, 4: t.steps.s4 };
  const months = (n: number) => t.months(n);
  const speedLabel = `${num(inputs.route.speedKmh, inputs.route.speedKmh % 1 ? 1 : 0, lang)} ${t.kmh}`;

  return (
    <div className="space-y-5">
      {/* Lead link */}
      {leadNotFound && <Notice tone="warning">{t.leadNotFound}</Notice>}
      {lead ? (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-4 w-4 text-info" aria-hidden />
              {t.linkedLead(lead.bedrijf)}
            </span>
            <span className="flex flex-wrap gap-2">
              <Link href={`/leads/${lead.id}`} className="text-info hover:underline">
                {t.openLead}
              </Link>
              <button type="button" className="inline-flex items-center gap-1 text-soft hover:text-ink" onClick={() => setLead(null)}>
                <Unlink className="h-3.5 w-3.5" aria-hidden />
                {t.unlink}
              </button>
            </span>
          </div>
        </Notice>
      ) : (
        leads.length > 0 &&
        canSave && (
          <Card className="p-4">
            <label className="label" htmlFor="roi-lead-search">
              {t.linkLeadLabel}
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <input id="roi-lead-search" className="field" type="search" placeholder={t.leadSearch} value={leadQuery} onChange={(ev) => setLeadQuery(ev.target.value)} />
              <select className="field" aria-label={t.linkLeadLabel} value="" onChange={(ev) => chooseLead(ev.target.value)}>
                <option value="">{t.noLead}</option>
                {filteredLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.bedrijf}
                    {l.contact ? ` — ${l.contact}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        )
      )}

      {/* Step indicator */}
      <nav aria-label={t.stepsAria} className="flex flex-wrap gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            aria-current={s === step ? 'step' : undefined}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
              s === step ? 'border-accent bg-accent text-accent-ink' : s < step ? 'border-positive text-positive' : 'border-line bg-card text-soft hover:text-ink',
            )}
          >
            {stepLabels[s]}
          </button>
        ))}
      </nav>

      {/* STEP 1 */}
      {step === 1 && (
        <>
          <Card>
            <CardHeader title={t.detailsTitle} />
            <div className="space-y-4 p-4">
              <p className="text-sm text-soft">{t.detailsIntro}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="roi-naam" label={t.name} placeholder={t.namePh} value={customer.naam} onChange={(v) => setCustomer({ ...customer, naam: v })} />
                <TextField id="roi-bedrijf" label={t.company} placeholder={t.companyPh} value={customer.bedrijf} onChange={(v) => setCustomer({ ...customer, bedrijf: v })} />
                <TextField
                  id="roi-email"
                  type="email"
                  label={t.email}
                  placeholder={t.emailPh}
                  value={customer.email}
                  invalid={emailError && !emailValid}
                  onChange={(v) => setCustomer({ ...customer, email: v })}
                />
                <TextField id="roi-tel" type="tel" label={t.phone} placeholder={t.phonePh} value={customer.telefoon} onChange={(v) => setCustomer({ ...customer, telefoon: v })} />
              </div>
            </div>
          </Card>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={() => go(2)}>
              {t.next2} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            {emailError && !emailValid && (
              <p className="text-sm text-warning" role="alert">
                {t.emailInvalid}
              </p>
            )}
          </div>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <Card>
            <CardHeader title={t.routeTitle} />
            <div className="p-4">
              <p className="mb-4 text-sm text-soft">{t.routeIntro}</p>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <Slider id="roi-len" label={t.length} display={`${inputs.route.lengthM} m`} min={5} max={200} step={5} value={inputs.route.lengthM} onChange={(v) => setRoute({ lengthM: v })} />
                  <Slider id="roi-wid" label={t.width} display={`${inputs.route.widthM} m`} min={5} max={200} step={5} value={inputs.route.widthM} onChange={(v) => setRoute({ widthM: v })} />
                  <Slider id="roi-speed" label={t.speed} display={speedLabel} min={3} max={20} step={0.5} value={inputs.route.speedKmh} onChange={(v) => setRoute({ speedKmh: v })} />
                  <div>
                    <label className="label" htmlFor="roi-routetype">
                      {t.routeType}
                    </label>
                    <select id="roi-routetype" className="field" value={inputs.route.diagonal ? 'diag' : 'rect'} onChange={(ev) => setRoute({ diagonal: ev.target.value === 'diag' })}>
                      <option value="rect">{t.rect}</option>
                      <option value="diag">{t.diag}</option>
                    </select>
                  </div>
                  <Check id="roi-return" checked={inputs.route.includeReturn} onChange={(v) => setRoute({ includeReturn: v })}>
                    {t.includeReturn}
                  </Check>
                  <Slider
                    id="roi-load"
                    label={t.loadTime}
                    display={fmtTime(inputs.route.loadSecondsPerPallet)}
                    min={0}
                    max={120}
                    step={5}
                    value={inputs.route.loadSecondsPerPallet}
                    onChange={(v) => setRoute({ loadSecondsPerPallet: v })}
                  />
                  <Slider id="roi-pallets" label={t.pallets} display={String(inputs.route.palletsPerTrip)} min={1} max={2} step={1} value={inputs.route.palletsPerTrip} onChange={(v) => setRoute({ palletsPerTrip: v })} />
                </div>
                <div className="grid content-start gap-3">
                  <Metric label={t.kpiDistance} value={`${num(route.distanceM, 0, lang)} m${inputs.route.includeReturn ? t.returnSuffix : ''}`} />
                  <Metric label={t.kpiRide} value={fmtTime(route.rideSeconds)} />
                  <Metric label={t.kpiCycleStd} value={`${fmtTime(route.cycleStandardSeconds)}${t.perPallet}`} />
                  <Metric label={t.kpiCycleMek} value={`${fmtTime(route.cycleMekPerPalletSeconds)}${t.perPallet}`} />
                  <Metric label={t.kpiEff} value={effLabel(result.efficiency, lang)} tone="positive" big />
                </div>
              </div>
            </div>
          </Card>
          <NavButtons back={{ label: t.back1, onClick: () => go(1) }} next={{ label: t.next3, onClick: () => go(3) }} />
        </>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-line" role="tablist">
            {(['koop', 'lease', 'aas'] as CostModel[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx('px-4 py-2 text-sm font-semibold transition', mode === m ? 'bg-accent text-accent-ink' : 'bg-card text-soft hover:text-ink')}
              >
                {t.models[m]}
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t.inputTitle} />
              <div className="space-y-4 p-4">
                <Slider id="roi-price" label={t.price} display={e(inputs.price)} min={5000} max={40000} step={500} value={inputs.price} onChange={(v) => set({ price: v })} />
                <Slider id="roi-comp" label={t.competitorPrice} display={e(inputs.competitorPrice)} min={0} max={40000} step={500} value={inputs.competitorPrice} onChange={(v) => set({ competitorPrice: v })} />
                <Slider id="roi-wage" label={t.wage} display={e(inputs.wage)} min={30000} max={70000} step={1000} value={inputs.wage} onChange={(v) => set({ wage: v })} />
                <div>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{t.efficiency}</span>
                    <span className="font-semibold text-accent">{effLabel(result.efficiency, lang)}</span>
                  </div>
                  <p className="text-xs italic text-soft">{t.effNote}</p>
                </div>
                <Slider id="roi-usage" label={t.usage} display={`${inputs.usagePct}%`} min={10} max={100} step={5} value={inputs.usagePct} onChange={(v) => set({ usagePct: v })} />
                <Slider id="roi-hours" label={t.hours} display={`${inputs.hoursPerDay} ${t.hoursUnit}`} min={1} max={24} step={1} value={inputs.hoursPerDay} onChange={(v) => set({ hoursPerDay: v })} />
                <Slider id="roi-shifts" label={t.shifts} display={String(inputs.shifts)} min={1} max={3} step={1} value={inputs.shifts} onChange={(v) => set({ shifts: v })} />
                <Slider id="roi-days" label={t.workDays} display={String(inputs.workDays)} min={100} max={365} step={1} value={inputs.workDays} onChange={(v) => set({ workDays: v })} />
                <p className="text-xs text-soft">{t.operatingNote(num(savings.operatingHoursPerDay, 0, lang), num(savings.fteSaved, 2, lang))}</p>

                {mode === 'lease' && (
                  <div className="space-y-4 border-t border-line pt-4">
                    <Slider id="roi-lterm" label={t.leaseTerm} display={months(inputs.lease.termMonths)} min={12} max={84} step={6} value={inputs.lease.termMonths} onChange={(v) => setLease({ termMonths: v })} />
                    <Slider id="roi-lrate" label={t.leaseRate} display={`${num(inputs.lease.ratePct, inputs.lease.ratePct % 1 ? 1 : 0, lang)}%`} min={1} max={15} step={0.5} value={inputs.lease.ratePct} onChange={(v) => setLease({ ratePct: v })} />
                    <Slider id="roi-lcomp" label={t.competitorLease} display={e(inputs.lease.competitorMonthly)} min={0} max={3000} step={25} value={inputs.lease.competitorMonthly} onChange={(v) => setLease({ competitorMonthly: v })} />
                    <Check id="roi-ldiff" checked={inputs.lease.useDifference} onChange={(v) => setLease({ useDifference: v })}>
                      {t.useDifference}
                    </Check>
                  </div>
                )}
                {mode === 'aas' && (
                  <div className="space-y-4 border-t border-line pt-4">
                    <Slider id="roi-aterm" label={t.aasTerm} display={months(inputs.aas.termMonths)} min={12} max={84} step={6} value={inputs.aas.termMonths} onChange={(v) => setAas({ termMonths: v })} />
                    <Slider id="roi-afee" label={t.aasFee} display={e(inputs.aas.monthlyFee)} min={300} max={1500} step={25} value={inputs.aas.monthlyFee} onChange={(v) => setAas({ monthlyFee: v })} />
                    <Slider id="roi-atruck" label={t.truckCosts} display={e(inputs.aas.truckCostsYear)} min={200} max={3000} step={100} value={inputs.aas.truckCostsYear} onChange={(v) => setAas({ truckCostsYear: v })} />
                    <Slider id="roi-ares" label={t.residual} display={`${inputs.aas.residualPct}%`} min={0} max={50} step={5} value={inputs.aas.residualPct} onChange={(v) => setAas({ residualPct: v })} />
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={t.resultTitle} />
              <div className="p-4">
                <ResultHeadline mode={mode} result={result} text={headline()} sub={subline()} />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {mode === 'koop' && (
                    <>
                      <Metric label={t.savingsYear} value={e(savings.perYear)} />
                      <Metric label={t.savings5y} value={e(koop.savings5y)} />
                      <Metric label={t.priceDiff} value={e(koop.priceDiff)} />
                      <Metric label={t.paybackExtra} value={paybackLabel(koop.paybackExtraMonths, t, lang)} tone="positive" />
                      <Metric label={t.paybackFull} value={paybackLabel(koop.paybackFullMonths, t, lang)} />
                    </>
                  )}
                  {mode === 'lease' && (
                    <>
                      <Metric label={t.leaseMonthly} value={e(lease.monthly)} />
                      <Metric label={t.competitorLease} value={e(lease.competitorMonthly)} />
                      <Metric label={t.diffMonthly} value={e(lease.diff)} />
                      <Metric label={t.netMonthly} value={e(lease.net)} tone={lease.net > 0 ? 'positive' : 'warning'} />
                      <Metric label={t.savingsMonth} value={e(savings.perMonth)} />
                      <Metric label={lease.useDifference ? t.leaseTotalDiff(lease.termMonths) : t.leaseTotal(lease.termMonths)} value={e(lease.totalCost)} />
                    </>
                  )}
                  {mode === 'aas' && (
                    <>
                      <Metric label={t.aasFee} value={e(aas.fee)} />
                      <Metric label={t.netMonthly} value={e(aas.net)} tone={aas.net > 0 ? 'positive' : 'warning'} />
                      <Metric label={t.savingsMonth} value={e(savings.perMonth)} />
                      <Metric label={t.aasTotal(aas.termMonths)} value={e(aas.totalCost)} />
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {mode === 'aas' && showMargin && (
            <Card className="internal-only border-warning/40">
              <CardHeader title={t.marginTitle}>
                <span className="text-xs text-soft">{t.marginHint}</span>
              </CardHeader>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <Metric label={t.depreciation} value={e(margin.depreciationMonthly)} />
                <Metric label={t.opex} value={e(margin.opexMonthly)} />
                <Metric label={t.costMonthly} value={e(margin.costMonthly)} />
                <Metric label={t.marginMonthly(`${num(margin.marginPct, 0, lang)}%`)} value={e(margin.marginMonthly)} tone={margin.marginMonthly > 0 ? 'positive' : 'warning'} />
                <Metric label={t.residualValue} value={e(margin.residualValue)} />
                <Metric label={t.marginTotal(aas.termMonths)} value={e(margin.marginTotal)} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={mode === 'koop' ? t.chartKoop : mode === 'lease' ? (lease.useDifference ? t.chartLeaseDiff : t.chartLease) : t.chartAas} />
            <div className="p-4">
              {mode === 'koop' ? (
                <KoopChart price={koop.price} priceDiff={koop.priceDiff} monthlySavings={savings.perMonth} months={KOOP_CHART_MONTHS} />
              ) : mode === 'lease' ? (
                <RecurringChart net={lease.net} months={recurringChartMonths(lease.termMonths)} ariaLabel={lease.useDifference ? t.chartLeaseDiff : t.chartLease} />
              ) : (
                <RecurringChart net={aas.net} months={recurringChartMonths(aas.termMonths)} ariaLabel={t.chartAas} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.interestTitle} />
            <div className="space-y-3 p-4">
              <p className="text-sm text-soft">{t.interestIntro}</p>
              <Button onClick={requestQuote}>
                <Mail className="h-4 w-4" aria-hidden /> {t.requestQuote}
              </Button>
              {mailStatus && <p className="text-sm text-positive">{mailStatus}</p>}
            </div>
          </Card>

          <NavButtons back={{ label: t.back2, onClick: () => go(2) }} next={{ label: t.next4, onClick: () => go(4) }} />
        </>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <>
          <Card>
            <CardHeader title={t.compareTitle} />
            <div className="p-4">
              <p className="mb-3 text-sm text-soft">{t.compareIntro}</p>
              <div className="table-wrap">
                <table className="data min-w-[560px]">
                  <thead>
                    <tr>
                      {comparisonHead(t).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows(result, t, lang).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, ci) => (
                          <td key={ci} className={ci === 0 ? 'text-soft' : undefined}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.quoteTitle} />
            <div className="space-y-4 p-4">
              <p className="text-sm text-soft">{t.quoteIntro(settings.quoteValidDays)}</p>
              {!canSave && <Notice tone="warning">{t.viewerNoSave}</Notice>}
              <Check id="roi-all" checked={allOptions} onChange={setAllOptions}>
                {t.allOptions}
              </Check>
              <div className="grid gap-4 sm:grid-cols-2">
                {!allOptions && (
                  <div>
                    <label className="label" htmlFor="roi-model">
                      {t.model}
                    </label>
                    <select id="roi-model" className="field" value={offerModel} onChange={(ev) => setOfferModel(ev.target.value as CostModel)}>
                      {(['koop', 'lease', 'aas'] as CostModel[]).map((m) => (
                        <option key={m} value={m}>
                          {t.models[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Slider id="roi-trucks" label={t.trucks} display={String(trucks)} min={1} max={20} step={1} value={trucks} onChange={setTrucks} />
              </div>
              <Button onClick={onSaveQuote} disabled={!canSave || busy !== null}>
                <FileText className="h-4 w-4" aria-hidden /> {busy === 'quote' ? t.saving : t.saveQuote}
              </Button>
              {quoteStatus && (
                <p className={cx('text-sm', quoteStatus.tone === 'positive' ? 'text-positive' : 'text-warning')} role="status">
                  {quoteStatus.text}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.exportTitle} />
            <div className="space-y-3 p-4">
              <p className="text-sm text-soft">{t.exportIntro}</p>
              <Button variant="secondary" onClick={onComparisonPdf} disabled={busy !== null}>
                <FileDown className="h-4 w-4" aria-hidden /> {busy === 'pdf' ? t.saving : t.downloadPdf}
              </Button>
              {pdfStatus && (
                <p className={cx('text-sm', pdfStatus.tone === 'positive' ? 'text-positive' : 'text-warning')} role="status">
                  {pdfStatus.text}
                </p>
              )}
            </div>
          </Card>

          <NavButtons back={{ label: t.back3, onClick: () => go(3) }} />
        </>
      )}

      <p className="text-center text-xs text-soft">{t.footer}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function ResultHeadline({ mode, result, text, sub }: { mode: CostModel; result: ReturnType<typeof computeRoi>; text: string; sub: string }) {
  let good: boolean;
  if (mode === 'koop') good = Number.isFinite(result.koop.paybackExtraMonths) && result.koop.paybackExtraMonths <= 24;
  else good = (mode === 'lease' ? result.lease.net : result.aas.net) > 0;
  return (
    <div>
      <div className={cx('mek-heading text-4xl', good ? 'text-positive' : 'text-warning')}>{text}</div>
      <p className="mt-1 text-sm text-soft">{sub}</p>
    </div>
  );
}

function Slider({
  id,
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="shrink-0 font-semibold text-accent">{display}</span>
      </label>
      <input id={id} type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(ev) => onChange(Number(ev.target.value))} />
    </div>
  );
}

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={checked} onChange={(ev) => onChange(ev.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={cx('field', invalid && 'border-warning')}
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(ev) => onChange(ev.target.value)}
      />
    </div>
  );
}

function Metric({ label, value, tone, big }: { label: string; value: string; tone?: 'positive' | 'warning'; big?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-card-2 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-soft">{label}</div>
      <div className={cx('mt-0.5 font-semibold', big ? 'mek-heading text-2xl' : 'text-base', tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : 'text-ink')}>
        {value}
      </div>
    </div>
  );
}

function NavButtons({ back, next }: { back?: { label: string; onClick: () => void }; next?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-wrap justify-between gap-3">
      {back ? (
        <Button variant="secondary" onClick={back.onClick}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button onClick={next.onClick}>
          {next.label} <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
