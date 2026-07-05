"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/network/request";

type ImportResult = {
  ok?: boolean;
  message?: string;
  providerId?: string;
  sourceHarFingerprint?: string;
  observedRequestCount?: number;
  observedEndpointCount?: number;
  rawHarStored?: boolean;
  secretRedactionStatus?: string;
  endpoints?: Array<{
    id: string;
    method: string;
    path: string;
    host?: string;
    operationGuess?: string;
    implemented: boolean;
    stability: string;
    sanitizedRequestShape?: string;
    sanitizedResponseShape?: string;
  }>;
  coverage?: {
    completeGenerationFlow: boolean;
    missingOperations: string[];
    missingGenerationFlowOperations: string[];
  };
};

export default function WebApiCapturePage() {
  const [providerId, setProviderId] = useState("pixverse_web");
  const [file, setFile] = useState<File>();
  const [previewOnly, setPreviewOnly] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const [savedReports, setSavedReports] = useState<ImportResult[]>([]);
  const [message, setMessage] = useState("");

  async function loadSavedReports() {
    try {
      const data = await requestJson<{ reports?: ImportResult[] }>("/api/web-api-capture");
      setSavedReports(data.reports || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load saved HAR reports.");
    }
  }

  useEffect(() => {
    void loadSavedReports();
  }, []);

  async function importHar() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("providerId", providerId);
      body.append("harFile", file);
      body.append("previewOnly", String(previewOnly));
      setResult(await requestJson<ImportResult>("/api/web-api-capture/import-har", { method: "POST", body }, { timeoutMs: 120_000 }));
      await loadSavedReports();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : "HAR import failed."
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <h1>Web API Capture</h1>
          <p className="muted">Import a user-provided HAR file and review a sanitized, provider-specific endpoint manifest.</p>
        </div>
        <div className="actions">
          <Link href="/provider-diagnostics">Provider diagnostics</Link>
          <Link href="/video-workflow">Back to workflow</Link>
        </div>
      </div>
      <div className="warning-panel">
        <strong>Experimental manual HAR only.</strong>
        <p>Web adapters are experimental and based on user-provided HAR files or browser-assisted manual observation. They do not bypass login, CAPTCHA, verification, rate limits, or platform protections.</p>
        <p>Browser-assisted mode is planned and disabled by default. This tool performs no automatic web submission and reads no browser cookies.</p>
      </div>
      {message ? <div className="notice" role="status">{message}</div> : null}
      <section className="panel">
        <h2>Import HAR</h2>
        <label className="field">
          <span>Web provider</span>
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="pixverse_web">PixVerse Web</option>
            <option value="pai_web">Pai Web</option>
          </select>
        </label>
        <label className="field">
          <span>HAR file</span>
          <input accept=".har,application/json" type="file" onChange={(event) => setFile(event.target.files?.[0])} />
        </label>
        <label className="check-field">
          <input checked={previewOnly} type="checkbox" onChange={(event) => setPreviewOnly(event.target.checked)} />
          <span>Preview only: parse and redact without saving the sanitized manifest report.</span>
        </label>
        <button className="primary" disabled={busy || !file} onClick={importHar}>{busy ? "Importing..." : "Import HAR"}</button>
        {result ? <CaptureResult result={result} /> : <p className="muted">HAR capture pending.</p>}
      </section>
      <section className="panel">
        <h2>Saved sanitized summaries</h2>
        {savedReports.length ? savedReports.map((report) => <CaptureResult key={report.providerId} result={{ ...report, ok: true, message: `${report.providerId} sanitized HAR summary.` }} />) : <p className="muted">HAR capture pending.</p>}
      </section>
      <section className="panel">
        <h2>Manual capture steps</h2>
        <ol>
          <li>Open PixVerse or Pai in your browser.</li>
          <li>Log in manually and complete any verification manually.</li>
          <li>Open DevTools, select Network, and enable Preserve log.</li>
          <li>Perform one action: check credits, upload an image, submit image-to-video, check task status, or download a result.</li>
          <li>Export the HAR file.</li>
          <li>Import the HAR file here.</li>
          <li>Review the sanitized provider-specific manifest.</li>
        </ol>
        <p className="muted">No CAPTCHA bypass. No stealth. No automated scraping.</p>
      </section>
    </main>
  );
}

function CaptureResult({ result }: { result: ImportResult }) {
  return (
    <div className={result.ok ? "notice" : "error-box"} role="status">
      <p>{result.message}</p>
      {result.ok ? (
        <>
          <p><strong>Provider:</strong> {result.providerId}</p>
          <p><strong>Source fingerprint:</strong> {result.sourceHarFingerprint}</p>
          <p><strong>Requests:</strong> {result.observedRequestCount}; <strong>endpoints:</strong> {result.observedEndpointCount}</p>
          <p><strong>Secret redaction:</strong> {result.secretRedactionStatus}; <strong>raw HAR stored:</strong> {String(result.rawHarStored)}</p>
          <p><strong>Complete generation flow:</strong> {String(result.coverage?.completeGenerationFlow || false)}</p>
          {result.coverage?.missingOperations.length ? <p><strong>Missing operations:</strong> {result.coverage.missingOperations.join(", ")}</p> : null}
          <div className="capture-table">
            <strong>Observed endpoint classification</strong>
          {result.endpoints?.map((endpoint) => (
            <details key={endpoint.id}>
              <summary><code>{endpoint.method} {endpoint.host}{endpoint.path}</code> - {endpoint.operationGuess} - implemented={String(endpoint.implemented)} - {endpoint.stability}</summary>
              <pre>{endpoint.sanitizedRequestShape}</pre>
              <pre>{endpoint.sanitizedResponseShape}</pre>
            </details>
          ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
