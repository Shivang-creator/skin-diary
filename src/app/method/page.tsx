import type { Metadata } from "next";
import Link from "next/link";
import {
  ANALYSIS_CONFIG,
} from "@/lib/analysis/engine";
import {
  CONCERNS,
  CONCERN_META,
  UNITS_PER_CAPTURE,
  UNIT_COST_TIERS,
} from "@/lib/domain";
import {
  FIXTURE_IS_REAL_CAPTURE,
  FIXTURE_PROVENANCE,
} from "@/lib/youcam/fixture";

export const metadata: Metadata = {
  title: "Method & limits — Slept On",
  description:
    "Exactly how Slept On computes its findings, what it costs to run, and the things it cannot tell you.",
};

export default function MethodPage() {
  return (
    <div className="py-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Method</p>
        <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight sm:text-[38px]">
          How this works, and
          <br />
          what it cannot tell you
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-2)]">
          A tool that makes claims about your body owes you its working. This
          page is the whole method — the API calls, the arithmetic, and the
          limits that no amount of data will remove.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <div className="space-y-12">
          {/* ---------------- Pipeline ---------------- */}
          <Section number="01" title="Where the numbers come from">
            <p>
              Each capture runs the four-step Perfect Corp YouCam AI Skin
              Analysis pipeline. It is asynchronous — you submit a task and
              poll for the result, rather than getting scores back from one
              request.
            </p>
            <ol className="mt-4 space-y-2">
              <Step
                n={1}
                code="POST /s2s/v2.0/file"
                text="Register the image and receive a file_id plus a presigned upload URL."
              />
              <Step
                n={2}
                code="PUT <presigned URL>"
                text="Upload the bytes. Registering the file does not upload it — skipping this is the classic integration bug and fails later with an opaque 500."
              />
              <Step
                n={3}
                code="POST /s2s/v2.0/task/skin-analysis"
                text="Start the task with the seven concerns and format: json. Returns a task_id."
              />
              <Step
                n={4}
                code="GET /s2s/v2.0/task/skin-analysis/{id}"
                text="Poll with backoff until the status is success or error."
              />
            </ol>
            <p className="mt-4">
              The photo is resized in your browser before upload and is never
              stored by Slept On. Scores are kept as YouCam&rsquo;s{" "}
              <code className="reading">raw_score</code>, not{" "}
              <code className="reading">ui_score</code> — their documentation
              is explicit that ui_score is adjusted upward for
              &ldquo;beauty psychology&rdquo;, and a diary trying to detect a
              four-point change over six weeks needs the unmassaged number.
            </p>
          </Section>

          {/* ---------------- Metrics ---------------- */}
          <Section number="02" title="Which seven metrics, and why">
            <p>
              YouCam exposes sixteen SD skin concerns. Slept On tracks seven.
              The other nine — wrinkles, firmness, age spots, eyelid droop, eye
              bags, tear trough, skin type — are structural. They do not
              meaningfully move in six weeks, so tracking them daily would add
              noise and cost units without adding information.
            </p>
            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {CONCERNS.map((c) => (
                <li key={c} className="flex gap-2 text-[13.5px]">
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-[1px]"
                    style={{ background: `var(--series-${CONCERN_META[c].slot})` }}
                  />
                  <span>
                    <strong className="font-medium">
                      {CONCERN_META[c].label}
                    </strong>{" "}
                    <span className="text-[var(--ink-2)]">
                      {CONCERN_META[c].blurb}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              All seven are scored 1–100 where <strong>higher is better</strong>
              . A redness score of 90 means very little redness. Slept On
              phrases every sentence in terms of the score rather than the
              concern, so the direction never inverts on you.
            </p>
          </Section>

          {/* ---------------- Statistics ---------------- */}
          <Section number="03" title="The arithmetic">
            <p>
              No model and no LLM touches the analysis. It is ordinary
              statistics, computed in the browser, and the same diary always
              produces the same findings.
            </p>

            <dl className="mt-4 space-y-4">
              <Term term="Spearman's rank correlation" >
                The default for numeric factors. Skin scores are noisy and
                occasionally spiky, and self-reported logs are coarse; rank
                correlation is robust to a single terrible day and catches
                relationships that are monotone without being linear.
              </Term>
              <Term term="Welch's t-test">
                For yes/no factors and for product change-points. Welch rather
                than Student because two groups in a real diary are never the
                same size or the same variance.
              </Term>
              <Term term="Lag search">
                Skin does not respond the same day. Every factor is tested
                against every metric at{" "}
                <span className="reading">
                  {ANALYSIS_CONFIG.lags.join(", ")}
                </span>{" "}
                days of lag, so &ldquo;last night&rsquo;s sleep&rdquo; is
                matched to this morning&rsquo;s face rather than to
                yesterday&rsquo;s.
              </Term>
              <Term term="Benjamini-Hochberg correction">
                This is the one that matters. Seven factors × seven metrics ×
                three lags is{" "}
                <span className="reading">147</span> hypotheses. At p &lt; 0.05
                roughly seven of them would look significant from pure noise —
                which is how a tool like this turns into a horoscope. Every
                p-value is corrected across the whole family actually tested,
                and the family size is printed on the insights page.
              </Term>
              <Term term="Partial correlation on photo brightness">
                Every surviving correlation is re-run holding your photo&rsquo;s
                measured brightness constant. If the relationship collapses,
                Slept On says so — it was your lighting, not your skin.
              </Term>
              <Term term="Minimum sample size">
                Nothing is reported below{" "}
                <span className="reading">
                  {ANALYSIS_CONFIG.minPairedObservations}
                </span>{" "}
                paired observations, however large the coefficient. A
                correlation over four points is noise, and presenting it with
                the same confidence as one over forty is the core dishonesty
                this product exists to avoid.
              </Term>
            </dl>

            <p className="mt-4">
              The statistical core has{" "}
              <strong>93 unit tests</strong> (<code className="reading">npm test</code>
              ), including the incomplete beta function and Student&rsquo;s t
              checked against closed-form identities and an independently
              implemented reference. The demo
              diary is generated with known planted relationships, and the
              tests assert that the engine recovers them{" "}
              <em>and finds nothing in the two factors deliberately given no
              effect at all</em>.
            </p>
          </Section>

          {/* ---------------- Limits ---------------- */}
          <Section number="04" title="What this cannot tell you">
            <div className="space-y-4">
              <Limit title="Correlation is not causation, and never becomes it">
                Slept On can tell you that your redness scores run higher
                after long sleeps. It cannot tell you that sleeping more will
                improve your skin. The nights you sleep well are probably also
                the nights you drank less, ate earlier and were less stressed —
                and no amount of self-tracking separates those without an
                experiment you would have to design deliberately.
              </Limit>
              <Limit title="The camera is a confound">
                Lighting, distance, lens, time of day and whether you just
                washed your face all move these scores, sometimes more than a
                genuinely good week does. Slept On measures your photo&rsquo;s
                brightness and controls for it, which helps, but it cannot
                control for what it cannot see.
              </Limit>
              <Limit title="Small samples lie, and two weeks is a small sample">
                Fourteen readings is enough to notice something and nowhere near
                enough to be sure of it. Every claim carries its n for exactly
                this reason. Distrust the small ones — including when they
                agree with you.
              </Limit>
              <Limit title="Self-reported logs are approximate">
                You are estimating last night&rsquo;s sleep from memory and
                rounding your water intake. That measurement error is real and
                it flattens genuine relationships, so a null result here is
                weaker evidence of absence than it looks.
              </Limit>
              <Limit title="It is not medical or dermatological advice">
                Slept On is a self-tracking tool. It does not diagnose
                anything, it is not a substitute for a dermatologist, and it
                should not be used to decide whether a skin condition needs
                treatment. If something on your skin worries you, see a doctor.
              </Limit>
              <Limit title="The scores are a vendor's model, not ground truth">
                These metrics are Perfect Corp&rsquo;s estimates from a single
                photograph. They are not clinical instrument readings, they
                carry their own error, and a change of a point or two is well
                inside it.
              </Limit>
            </div>
          </Section>
        </div>

        {/* ---------------- Sidebar ---------------- */}
        <aside className="space-y-6">
          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Unit economics</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              YouCam prices skin analysis in tiers by concern count. Slept On
              asks for {CONCERNS.length}, which is the top of the second tier —
              the most information per unit spent.
            </p>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              {UNIT_COST_TIERS.map((t) => (
                <div
                  key={t.label}
                  className="flex items-baseline justify-between gap-3 border-b pb-1.5 last:border-0"
                >
                  <dt className="text-[var(--ink-2)]">{t.label}</dt>
                  <dd className="reading font-medium">{t.units} units</dd>
                </div>
              ))}
            </dl>
            <p className="reading mt-3 border-t pt-3 text-[13px]">
              <strong className="font-semibold">
                {UNITS_PER_CAPTURE} units
              </strong>{" "}
              <span className="text-[var(--ink-2)]">per capture</span>
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
              Units are charged only on a successful result. A photo the engine
              rejects — no face, too dark, face too small — costs nothing.
            </p>
          </div>

          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Fixture mode</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              With no API key configured, Slept On runs entirely on a stored
              response in the exact shape of the real endpoint, parsed by the
              exact same code. Captures are labelled{" "}
              <span className="reading">SIMULATED</span> everywhere they appear
              and spend nothing. It is the reason this app could be built
              without exhausting its budget.
            </p>
            {/*
              Stating the fixture's true provenance rather than implying it is
              a captured response. If the shipped file is still the schema
              sample, saying so is the only honest option.
            */}
            <p className="mt-2 border-t pt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
              {FIXTURE_IS_REAL_CAPTURE ? (
                <>
                  The bundled fixture is a genuine captured response, recorded{" "}
                  {FIXTURE_PROVENANCE.capturedAt?.slice(0, 10)} at a cost of{" "}
                  <span className="reading">
                    {FIXTURE_PROVENANCE.unitsConsumed}
                  </span>{" "}
                  units.
                </>
              ) : (
                <>
                  The bundled fixture is currently built from YouCam&rsquo;s
                  published response schema, not from a captured live call.
                  Running{" "}
                  <code className="reading">npm run capture:fixture</code> with
                  a key replaces it with a genuine response and records what it
                  cost.
                </>
              )}
            </p>
          </div>

          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Your data</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              No account, no server, no database. Entries live in this
              browser&rsquo;s localStorage and nowhere else. Photos are sent to
              YouCam for analysis and are never stored by Slept On. Clearing
              your browser data deletes your diary permanently.
            </p>
            <Link
              href="/log"
              className="mt-3 inline-block text-[13px] underline underline-offset-2"
            >
              View or delete your diary
            </Link>
          </div>

          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Built on</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-[var(--ink-2)]">
              <li>
                <a
                  href="https://docs.perfectcorp.com/reference/ai_skin_analysis"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  YouCam AI Skin Analysis API
                </a>{" "}
                (Perfect Corp)
              </li>
              <li>Next.js · TypeScript · Tailwind</li>
              <li>No charting library — the plots are hand-drawn SVG</li>
              <li>No analytics, no trackers, no cookies</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 border-b pb-2">
        <span className="reading text-[12px] text-[var(--ink-3)]">{number}</span>
        <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-[14px] leading-relaxed text-[var(--ink-2)] [&_strong]:text-[var(--ink)]">
        {children}
      </div>
    </section>
  );
}

function Step({ n, code, text }: { n: number; code: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="reading mt-0.5 text-[11px] text-[var(--ink-3)]">
        {n}
      </span>
      <span>
        <code className="reading text-[12.5px] text-[var(--ink)]">{code}</code>
        <br />
        <span className="text-[13.5px]">{text}</span>
      </span>
    </li>
  );
}

function Term({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[14px] font-medium text-[var(--ink)]">{term}</dt>
      <dd className="mt-1 text-[13.5px] leading-relaxed">{children}</dd>
    </div>
  );
}

function Limit({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-l-[var(--warning)] pl-3">
      <h3 className="text-[14px] font-medium text-[var(--ink)]">{title}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed">{children}</p>
    </div>
  );
}
