"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/network/request";

type Fingerprint = {
  present: boolean;
  length: number;
  masked: string;
  sha256Prefix: string;
};

type SettingsField = {
  envKey: string;
  label: string;
  sensitive: boolean;
  configured: boolean;
  value?: string;
  fingerprint?: Fingerprint;
};

type SettingsProvider = {
  id: string;
  label: string;
  description: string;
  updatedAt?: string;
  fields: SettingsField[];
};

export default function ProviderSettingsPage() {
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await requestJson<{ providers?: SettingsProvider[] }>("/api/provider-settings");
      setProviders(data.providers || []);
    } catch (error) {
      onPageLoadError(error, setMessage);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <h1>Provider Settings</h1>
          <p className="muted">Save local development credentials without placing full secrets in the browser after save.</p>
        </div>
        <div className="actions">
          <Link href="/provider-diagnostics">Provider diagnostics</Link>
          <Link href="/video-workflow">Back to workflow</Link>
        </div>
      </div>
      <div className="provider-warning">
        PixVerse and Pai credentials remain separate. Saved values go to <code>.env.local</code>, which is ignored by git. For production, move secrets to server-side secret storage.
      </div>
      {message ? <div className="notice" role="status">{message}</div> : null}
      <div className="flow">
        {providers.map((provider) => (
          <ProviderSettingsCard
            key={provider.id}
            provider={provider}
            onMessage={setMessage}
            onReload={load}
          />
        ))}
      </div>
    </main>
  );
}

function ProviderSettingsCard({ provider, onMessage, onReload }: {
  provider: SettingsProvider;
  onMessage: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const data = await requestJson<{ ok?: boolean; message?: string }>("/api/provider-settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id, envUpdates: draft })
      });
      onMessage(data.message || (data.ok ? "Credentials saved." : "Unable to save provider settings."));
      if (data.ok) {
        setDraft({});
        setVisible({});
        await onReload();
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Unable to save provider settings.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    try {
      const data = await requestJson<{ ok?: boolean; status?: string; sanitizedError?: string }>("/api/provider-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id })
      });
      onMessage(data.ok ? `${provider.label}: connection test passed.` : `${provider.label}: ${data.sanitizedError || data.status || "connection test unavailable"}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `${provider.label}: connection test unavailable`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>{provider.label}</h2>
      <p className="muted">{provider.description}</p>
      {provider.updatedAt ? <p className="muted">Last local settings update: {provider.updatedAt}</p> : null}
      {provider.fields.map((field) => {
        const value = draft[field.envKey] ?? field.value ?? "";
        return (
          <div className="settings-field" key={field.envKey}>
            <label className="field">
              <span>{field.label} <code>{field.envKey}</code></span>
              <input
                autoComplete="off"
                type={field.sensitive && !visible[field.envKey] ? "password" : "text"}
                value={value}
                placeholder={field.sensitive && field.configured ? "Configured. Enter a replacement or clear it." : ""}
                onChange={(event) => setDraft((current) => ({ ...current, [field.envKey]: event.target.value }))}
              />
            </label>
            <div className="actions">
              {field.sensitive ? (
                <button type="button" disabled={busy} onClick={() => setVisible((current) => ({ ...current, [field.envKey]: !current[field.envKey] }))}>
                  {visible[field.envKey] ? "Hide" : "Show temporarily"}
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => setDraft((current) => ({ ...current, [field.envKey]: "" }))}>Clear</button>
            </div>
            {field.sensitive ? (
              <p className="muted">
                Saved fingerprint: {field.fingerprint?.present
                  ? `${field.fingerprint.masked} / length ${field.fingerprint.length} / sha256 ${field.fingerprint.sha256Prefix}`
                  : "not configured"}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="actions">
        <button className="primary" disabled={busy || Object.keys(draft).length === 0} onClick={save}>Save locally</button>
        <button disabled={busy} onClick={testConnection}>Test connection</button>
      </div>
    </section>
  );
}

function onPageLoadError(error: unknown, setMessage: (message: string) => void): void {
  setMessage(error instanceof Error ? error.message : "Unable to load provider settings.");
}
