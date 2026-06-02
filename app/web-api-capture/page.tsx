"use client";

import Link from "next/link";
import { useState } from "react";

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
  }>;
};

export default function WebApiCapturePage() {
  const [providerId, setProviderId] = useState("pixverse_web");
  const [file, setFile] = useState<File>();
  const [previewOnly, setPreviewOnly] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);

  async function importHar() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("providerId", providerId);
      body.append("harFile", file);
      body.append("previewOnly", String(previewOnly));
      const response = await fetch("/api/web-api-capture/import-har", { method: "POST", body });
      setResult(await response.json() as ImportResult);
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
          {result.endpoints?.map((endpoint) => (
            <p key={endpoint.id}><code>{endpoint.method} {endpoint.host}{endpoint.path}</code> - {endpoint.operationGuess} - implemented={String(endpoint.implemented)} - {endpoint.stability}</p>
          ))}
        </>
      ) : null}
    </div>
  );
}
