import Link from "next/link";
import { getProviderDiagnostics } from "@/lib/providers/providerDiagnostics";

const groupLabels = {
  pixverse: "PixVerse",
  pai: "Pai",
  custom: "Custom"
} as const;

export default function ProviderDiagnosticsPage() {
  const providers = getProviderDiagnostics();
  return (
    <main className="page">
      <div className="topbar">
        <div>
          <h1>Provider Diagnostics</h1>
          <p className="muted">Provider credentials, balances, endpoint manifests, and account scopes remain isolated.</p>
        </div>
        <Link href="/video-workflow">Back to workflow</Link>
      </div>
      <div className="provider-warning">
        PixVerse and Pai use separate accounts and separate credits. Pai diagnostics never use PixVerse credentials or PixVerse balance.
      </div>
      <div className="flow">
        {(["pixverse", "pai", "custom"] as const).map((group) => (
          <section className="panel" key={group}>
            <h2>{groupLabels[group]}</h2>
            <div className="provider-card-grid">
              {providers.filter((provider) => provider.group === group).map((provider) => (
                <article className="provider-card" key={provider.id}>
                  <div className="provider-card-heading">
                    <h3>{provider.label}</h3>
                    <span className="badge">{provider.experimental ? "experimental" : provider.stable ? "stable" : "scaffold"}</span>
                  </div>
                  <p><strong>Provider ID:</strong> {provider.id}</p>
                  <p><strong>Account scope:</strong> {provider.accountScope}</p>
                  <p><strong>Source:</strong> {provider.source === "official_api" ? "official API" : "web"}</p>
                  <p><strong>Credential status:</strong> {provider.credentialStatus}</p>
                  <p><strong>Balance status:</strong> {provider.balanceStatus}</p>
                  {provider.credentials.map((credential) => (
                    <p key={credential.envKey}><strong>{credential.envKey} fingerprint:</strong> {credential.present ? `${credential.masked} / ${credential.sha256Prefix}` : "not configured"}</p>
                  ))}
                  {provider.source === "web" ? <p><strong>Session mode:</strong> {provider.sessionMode}; profile key: {provider.sessionProfileEnvKey}; cookies and tokens are never displayed.</p> : null}
                  <details>
                    <summary>Endpoint manifest ({provider.endpointManifest.length})</summary>
                    {provider.endpointManifest.length === 0 ? <p>No observed endpoints recorded yet.</p> : provider.endpointManifest.map((endpoint) => (
                      <p key={endpoint.id}><code>{endpoint.method} {endpoint.path || "(not configured)"}</code> - {endpoint.implemented ? "implemented" : "implemented=false"}</p>
                    ))}
                  </details>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
