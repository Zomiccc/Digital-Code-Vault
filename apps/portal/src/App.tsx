import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  Gift,
  LockKeyhole,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Delivery = {
  product_name: string;
  reference_id: string | null;
  fulfillment_id: string;
  is_revealed: boolean;
};
type Code = { denomination: string; code: string };
const API_BASE = import.meta.env.DEV
  ? "http://localhost:3000/api/v1"
  : "/api/v1";
async function request(token: string, reveal = false) {
  const res = await fetch(
    `${API_BASE}/d/${encodeURIComponent(token)}${reveal ? "/reveal" : ""}`,
    {
      method: reveal ? "POST" : "GET",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    },
  );
  if (!res.ok)
    throw new Error(
      res.status === 404 && !reveal
        ? "This delivery link is unavailable. Open the original link in your delivery email, or contact your seller."
        : "We couldn’t load your delivery. Please try again or contact your seller with your order reference.",
    );
  return res.json();
}
export default function App() {
  const token = window.location.pathname.startsWith("/d/")
    ? window.location.pathname.slice(3).replace(/\/$/, "")
    : "";
  const [info, setInfo] = useState<Delivery | null>(null);
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError("");
    request(token)
      .then((data) => {
        if (active) setInfo(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  async function reveal() {
    setBusy(true);
    setError("");
    try {
      const data = await request(token, true);
      if (!data.codes?.length)
        throw new Error(
          "Your codes couldn’t be retrieved. Please try again or contact your seller.",
        );
      setCodes(data.codes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(code: string, index: number) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(index);
      setNotice(`Code ${index + 1} copied to clipboard.`);
    } catch {
      setCopied(null);
      setNotice("Copy isn’t available. Select the code and copy it manually.");
    }
  }
  return (
    <div className="delivery-shell">
      <header className="brand-bar">
        <a className="brand" href="#main">
          <span className="brand-icon">
            <LockKeyhole size={19} />
          </span>
          CodeHub
          <span className="brand-divider" />
          Delivery
        </a>
        <span className="private-label">
          <ShieldCheck size={16} /> Private delivery
        </span>
      </header>
      <main id="main">
        <div className="eyebrow">YOUR DIGITAL DELIVERY</div>
        <h1>
          {loading
            ? "Getting your order ready."
            : !token || (!info && error)
              ? "Let’s find your delivery."
              : codes
                ? "All yours. Ready to use."
                : "Something good is ready."}
        </h1>
        <p className="intro">
          {codes
            ? "Copy your codes below and redeem them with the product provider."
            : "Your purchase, in one place. Reveal your codes when you’re ready."}
        </p>
        {loading ? (
          <section className="panel state-panel" role="status">
            <Loader2 className="spinner" />
            <h2>Loading your delivery</h2>
            <p>This should only take a moment.</p>
          </section>
        ) : !token || !info ? (
          <section className="panel state-panel">
            <AlertCircle size={32} />
            <h2>Delivery link unavailable</h2>
            <p>
              {error ||
                "Open the secure link in your delivery email to access your order."}
            </p>
            {token && (
              <button
                className="primary"
                onClick={() => setAttempt(attempt + 1)}
              >
                Try again <ArrowRight size={18} />
              </button>
            )}
          </section>
        ) : (
          <div className="delivery-grid">
            <section
              className="panel order-panel"
              aria-labelledby="order-heading"
            >
              <span className="status">
                <span /> Order ready
              </span>
              <div className="product-icon">
                <Gift size={34} strokeWidth={1.5} />
              </div>
              <p className="eyebrow">YOUR PURCHASE</p>
              <h2 id="order-heading">{info.product_name}</h2>
              <dl>
                <div>
                  <dt>Order reference</dt>
                  <dd>{info.reference_id || info.fulfillment_id}</dd>
                </div>
                <div>
                  <dt>Delivery method</dt>
                  <dd>Digital code</dd>
                </div>
                <div>
                  <dt>Link availability</dt>
                  <dd>Permanent access</dd>
                </div>
              </dl>
              <div className="order-note">
                <ShieldCheck size={19} />
                <p>
                  Keep this link private. Anyone with it can view your codes.
                </p>
              </div>
            </section>
            <section
              className="panel reveal-panel"
              aria-labelledby="codes-heading"
            >
              <div className="section-heading">
                <span className="step">
                  {codes ? <Check size={20} /> : <Eye size={20} />}
                </span>
                <span className="eyebrow">
                  {codes ? "DELIVERY OPENED" : "READY WHEN YOU ARE"}
                </span>
              </div>
              <h2 id="codes-heading">
                {codes
                  ? `Your digital code${codes.length === 1 ? "" : "s"}`
                  : "Unlock your next experience."}
              </h2>
              <p>
                {codes
                  ? "Use each code with the matching product and region."
                  : "Your codes stay hidden until you choose to reveal them. You can return to this link to view them again."}
              </p>
              {!codes && (
                <>
                  <div className="locked-preview" aria-hidden="true">
                    <LockKeyhole size={22} />
                    <span>•••• — •••• — ••••</span>
                    <small>Waiting to be revealed</small>
                  </div>
                  <button className="primary" disabled={busy} onClick={reveal}>
                    {busy ? (
                      <>
                        <Loader2 className="spinner" size={18} /> Revealing your
                        codes…
                      </>
                    ) : (
                      <>
                        {info.is_revealed
                          ? "View my codes again"
                          : "Reveal my codes"}
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="micro">Code access is recorded for security.</p>
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {codes && (
                <div className="code-list">
                  {codes.map((item, index) => (
                    <article className="code-item" key={index}>
                      <div className="code-top">
                        <span>
                          Code {String(index + 1).padStart(2, "0")}{" "}
                          <strong>{item.denomination}</strong>
                        </span>
                        <button
                          className="copy"
                          onClick={() => copy(item.code, index)}
                          aria-label={`Copy code ${index + 1}`}
                        >
                          {copied === index ? (
                            <Check size={16} />
                          ) : (
                            <Copy size={16} />
                          )}
                          {copied === index ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <code tabIndex={0}>{item.code}</code>
                    </article>
                  ))}
                </div>
              )}
              <p className="copy-notice" role="status" aria-live="polite">
                {notice}
              </p>
              <div className="next-step">
                <span>01</span>
                <div>
                  <h3>
                    {codes ? "Redeem with your provider" : "Reveal your codes"}
                  </h3>
                  <p>
                    {codes
                      ? "Open the provider’s app or website and follow their redemption instructions."
                      : "Use the button above to securely view your purchase."}
                  </p>
                </div>
              </div>
              <div className="next-step">
                <span>02</span>
                <div>
                  <h3>Keep your delivery email</h3>
                  <p>
                    Your link never expires. Return whenever you need your
                    codes.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
        <aside className="help">
          <strong>Need a hand?</strong> Contact the seller who sent your
          delivery email and include your order reference.
        </aside>
      </main>
      <footer>
        <span className="brand">CodeHub</span>
        <span>Digital goods. Thoughtfully delivered.</span>
        <span>
          <LockKeyhole size={13} /> Keep your codes private
        </span>
      </footer>
    </div>
  );
}
