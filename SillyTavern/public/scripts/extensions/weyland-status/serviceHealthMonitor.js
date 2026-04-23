/**
 * Multi-source external service health: each source fetches one public feed and runs one or more monitors.
 * Add sources to DEFAULT_HEALTH_SOURCES, or pass { sources } to createServiceHealthMonitor.
 */

export const AWS_PUBLIC_HEALTH_EVENTS_URL = 'https://health.aws.amazon.com/public/currentevents';

/** Google Workspace Status Dashboard (public JSON). */
export const GOOGLE_WORKSPACE_INCIDENTS_URL = 'https://www.google.com/appsstatus/dashboard/incidents.json';

/** Google Cloud status (public JSON). */
export const GOOGLE_CLOUD_INCIDENTS_URL = 'https://status.cloud.google.com/incidents.json';

/** Cloudflare public status (Statuspage API v2 summary). */
export const CLOUDFLARE_STATUS_SUMMARY_URL = 'https://www.cloudflarestatus.com/api/v2/summary.json';

/** Anthropic public status (Statuspage API v2 summary). */
export const ANTHROPIC_STATUS_SUMMARY_URL = 'https://status.anthropic.com/api/v2/summary.json';

/** Workspace incidents use this id for the Gemini product card. */
const GOOGLE_WORKSPACE_GEMINI_SERVICE_KEY = 'npdyhgECDJ6tB66MxXyo';

/** GCP product ids (from public products.json) tied to Gemini backends Antigravity may use. */
const GOOGLE_CLOUD_ANTIGRAVITY_RELATED_PRODUCT_IDS = new Set([
    'Z0FZJAMvEB4j3NbCJs6B', // Vertex Gemini API
    'deUeOEPYanfJ9w8cpyBJ', // Gemini Code Assist
]);

/** @typedef {'ok' | 'disrupted' | 'down' | 'unknown'} HealthLevel */

/**
 * @typedef {object} ServiceHealthResult
 * @property {string} id
 * @property {string} label
 * @property {HealthLevel} level
 * @property {number | null} sinceUnixSec When the active incident began (API), or null if normal/unknown
 * @property {string | null} headline Short human summary when not ok (or fetch error detail when unknown)
 * @property {string | null} incidentUrl Link to official health / incident context
 * @property {string | null} [note] Optional context copied from the parent health source
 */

/**
 * @typedef {object} HealthMonitor
 * @property {string} id
 * @property {string} label
 * @property {(payload: unknown) => ServiceHealthResult} evaluate
 */

/**
 * @typedef {object} HealthSource
 * @property {string} id
 * @property {string} label Short label for error messages (e.g. "AWS Health")
 * @property {string} [note] Shown in the panel details for every status level
 * @property {(fetchFn: typeof fetch) => Promise<unknown>} fetchPayload
 * @property {HealthMonitor[]} monitors
 */

/**
 * @param {HealthSource[]} sources
 * @returns {HealthMonitor[]}
 */
export function flattenMonitorsFromSources(sources) {
    return sources.flatMap((s) => s.monitors);
}

/**
 * @param {string} key impacted_services map key, e.g. bedrock-us-east-1
 * @param {{ service_name?: string }} entry
 */
function impactedEntryIsBedrock(key, entry) {
    if (/^bedrock-/i.test(key)) return true;
    const name = (entry?.service_name || '').toLowerCase();
    return name.includes('bedrock');
}

/**
 * @param {number} cur
 * @param {number} max
 * @returns {HealthLevel}
 */
function levelFromCurrentMax(cur, max) {
    if (!Number.isFinite(cur) || cur <= 0) return 'ok';
    if (!Number.isFinite(max) || max <= 0) return cur > 0 ? 'disrupted' : 'ok';
    if (cur >= max) return 'down';
    return 'disrupted';
}

function worstLevel(a, b) {
    const rank = { ok: 0, unknown: 1, disrupted: 2, down: 3 };
    return rank[a] >= rank[b] ? a : b;
}

/**
 * Worst (most severe) health level among a list of per-service results.
 * @param {ServiceHealthResult[]} results
 * @returns {HealthLevel}
 */
export function aggregateWorstLevel(results) {
    let w = /** @type {HealthLevel} */ ('ok');
    for (const r of results) w = worstLevel(w, r.level);
    return w;
}

/**
 * @param {HealthLevel} level
 * @returns {string} Suffix for `wst-health-dot--${suffix}` (e.g. ok, amber, red, unknown)
 */
export function healthLevelToDotClassSuffix(level) {
    if (level === 'ok') return 'ok';
    if (level === 'disrupted') return 'amber';
    if (level === 'down') return 'red';
    return 'unknown';
}

/**
 * @param {HealthLevel} level
 * @returns {string}
 */
export function healthLevelToStateLabel(level) {
    if (level === 'ok') return 'Normal';
    if (level === 'disrupted') return 'Disrupted';
    if (level === 'down') return 'Down';
    return 'Unknown';
}

/**
 * Earliest API timestamp for “when trouble began” for an event card.
 * @param {Record<string, unknown>} event
 * @returns {number | null} unix seconds
 */
function eventStartedUnix(event) {
    const root = Number.parseInt(String(event.date ?? ''), 10);
    let minT = Number.isFinite(root) ? root : null;
    const log = event.event_log;
    if (Array.isArray(log)) {
        for (const entry of log) {
            const t = Number(entry?.timestamp);
            if (Number.isFinite(t)) {
                minT = minT === null ? t : Math.min(minT, t);
            }
        }
    }
    return minT;
}

/**
 * @param {unknown[]} events
 * @returns {ServiceHealthResult}
 */
export function evaluateAmazonBedrock(events) {
    /** @type {HealthLevel} */
    let worst = 'ok';
    /** @type {number | null} */
    let since = null;
    let headline = null;
    let incidentArn = null;

    if (!Array.isArray(events)) {
        return {
            id: 'amazon-bedrock',
            label: 'Amazon Bedrock',
            level: 'unknown',
            sinceUnixSec: null,
            headline: 'Unexpected response from AWS status feed.',
            incidentUrl: 'https://health.aws.amazon.com/health/status',
        };
    }

    for (const raw of events) {
        const event = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!event) continue;

        const impacted = event.impacted_services;
        if (!impacted || typeof impacted !== 'object') continue;

        let touchesBedrock = false;
        for (const [key, val] of Object.entries(impacted)) {
            const svc = val && typeof val === 'object' ? /** @type {Record<string, unknown>} */ (val) : {};
            if (!impactedEntryIsBedrock(key, svc)) continue;
            touchesBedrock = true;
            const cur = Number.parseInt(String(svc.current ?? '0'), 10);
            const max = Number.parseInt(String(svc.max ?? '0'), 10);
            worst = worstLevel(worst, levelFromCurrentMax(cur, max));
        }

        const svcTop = String(event.service || '').toUpperCase();
        const svcNameTop = String(event.service_name || '');
        if (!touchesBedrock && (svcTop === 'BEDROCK' || /bedrock/i.test(svcNameTop))) {
            touchesBedrock = true;
            worst = worstLevel(worst, 'disrupted');
        }

        if (touchesBedrock) {
            const started = eventStartedUnix(event);
            if (started !== null && (since === null || started < since)) since = started;
            if (!headline) headline = String(event.summary || event.service_name || 'Amazon Bedrock incident');
            if (!incidentArn && event.arn) incidentArn = String(event.arn);
        }
    }

    const incidentUrl = incidentArn
        ? `https://health.aws.amazon.com/health/home#/event-log?eventARN=${encodeURIComponent(incidentArn)}`
        : 'https://health.aws.amazon.com/health/status';

    return {
        id: 'amazon-bedrock',
        label: 'Amazon Bedrock',
        level: worst,
        sinceUnixSec: worst === 'ok' ? null : since,
        headline: worst === 'ok' ? null : headline,
        incidentUrl,
    };
}

/**
 * @param {Record<string, unknown>} inc
 */
function googleWorkspaceIncidentTouchesAntigravity(inc) {
    if (String(inc.service_key || '') === GOOGLE_WORKSPACE_GEMINI_SERVICE_KEY) return true;
    if (/^gemini$/i.test(String(inc.service_name || '').trim())) return true;
    const products = inc.affected_products;
    if (Array.isArray(products)) {
        for (const p of products) {
            const t = String((p && typeof p === 'object' && /** @type {{ title?: string }} */ (p).title) || '');
            if (/antigravity/i.test(t) || /^gemini$/i.test(t.trim())) return true;
        }
    }
    const blob = `${inc.external_desc || ''}\n${(inc.most_recent_update && typeof inc.most_recent_update === 'object' && String(/** @type {{ text?: string }} */ (inc.most_recent_update).text)) || ''}`;
    if (/antigravity/i.test(blob)) return true;
    if (/gemini\.google\.com/i.test(blob)) return true;
    return false;
}

/**
 * @param {Record<string, unknown>} inc
 */
function googleCloudIncidentTouchesAntigravity(inc) {
    const products = inc.affected_products;
    if (Array.isArray(products)) {
        for (const p of products) {
            if (!p || typeof p !== 'object') continue;
            const row = /** @type {{ id?: string, title?: string }} */ (p);
            const id = String(row.id || '');
            if (GOOGLE_CLOUD_ANTIGRAVITY_RELATED_PRODUCT_IDS.has(id)) return true;
            const title = String(row.title || '');
            if (/antigravity/i.test(title)) return true;
            if (/vertex gemini api/i.test(title.toLowerCase())) return true;
            if (/gemini code assist/i.test(title.toLowerCase())) return true;
        }
    }
    const blob = `${inc.external_desc || ''}\n${inc.service_name || ''}\n${(inc.most_recent_update && typeof inc.most_recent_update === 'object' && String(/** @type {{ text?: string }} */ (inc.most_recent_update).text)) || ''}`;
    if (/antigravity/i.test(blob)) return true;
    return false;
}

/**
 * @param {Record<string, unknown>} inc
 */
function googleIncidentIsActive(inc) {
    const mr = inc.most_recent_update;
    const st = mr && typeof mr === 'object' ? String(/** @type {{ status?: string }} */ (mr).status || '') : '';
    if (st === 'AVAILABLE' || st === 'FALSE_POSITIVE') return false;
    if (st === 'SERVICE_OUTAGE' || st === 'SERVICE_DISRUPTION' || st === 'SERVICE_INFORMATION') return true;
    if (!st && (inc.end == null || inc.end === '')) return true;
    return false;
}

/**
 * @param {string} status
 * @returns {HealthLevel}
 */
function levelFromGoogleDashboardStatus(status) {
    switch (status) {
        case 'SERVICE_OUTAGE':
            return 'down';
        case 'SERVICE_DISRUPTION':
        case 'SERVICE_INFORMATION':
            return 'disrupted';
        default:
            return 'unknown';
    }
}

/**
 * @param {Record<string, unknown>} inc
 * @returns {HealthLevel}
 */
function levelFromGoogleIncident(inc) {
    const mr = inc.most_recent_update;
    const st = mr && typeof mr === 'object' ? String(/** @type {{ status?: string }} */ (mr).status || '') : '';
    if (st === 'AVAILABLE' || st === 'FALSE_POSITIVE') return 'ok';
    const mapped = levelFromGoogleDashboardStatus(st);
    if (mapped !== 'unknown') return mapped;
    return 'disrupted';
}

/**
 * @param {Record<string, unknown>} inc
 */
function parseGoogleIncidentBeginUnix(inc) {
    const t = Date.parse(String(inc.begin || ''));
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/**
 * @param {Record<string, unknown>} inc
 */
function headlineFromGoogleIncident(inc) {
    const raw = String(inc.external_desc || inc.service_name || 'Google incident');
    const line = raw.split('\n')[0].replace(/\*\*/g, '').trim();
    return line.length > 220 ? `${line.slice(0, 217)}…` : line;
}

/**
 * @param {Record<string, unknown>} inc
 * @param {'workspace' | 'gcp'} kind
 */
function googleIncidentDetailUrl(inc, kind) {
    const uri = String(inc.uri || '').replace(/^\//, '');
    if (!uri) {
        return kind === 'workspace'
            ? 'https://www.google.com/appsstatus/dashboard'
            : 'https://status.cloud.google.com/';
    }
    return kind === 'workspace'
        ? `https://www.google.com/appsstatus/dashboard/${uri}`
        : `https://status.cloud.google.com/${uri}`;
}

/**
 * @typedef {{ workspaceIncidents: unknown[], gcpIncidents: unknown[] }} GoogleAntigravityPayload
 */

/**
 * Fetches Workspace and Cloud incident JSON in parallel. Throws only if both requests fail.
 * @param {typeof fetch} fetchFn
 * @returns {Promise<GoogleAntigravityPayload>}
 */
export async function fetchGoogleAntigravityBundle(fetchFn) {
    const [wsSettled, gcpSettled] = await Promise.allSettled([
        fetchJsonWithProxy(fetchFn, GOOGLE_WORKSPACE_INCIDENTS_URL),
        fetchJsonWithProxy(fetchFn, GOOGLE_CLOUD_INCIDENTS_URL),
    ]);

    /** @type {unknown[]} */
    let workspaceIncidents = [];
    /** @type {unknown[]} */
    let gcpIncidents = [];

    if (wsSettled.status === 'fulfilled') {
        const v = wsSettled.value;
        workspaceIncidents = Array.isArray(v) ? v : [];
    }
    if (gcpSettled.status === 'fulfilled') {
        const v = gcpSettled.value;
        gcpIncidents = Array.isArray(v) ? v : [];
    }

    if (wsSettled.status === 'rejected' && gcpSettled.status === 'rejected') {
        const a = wsSettled.reason instanceof Error ? wsSettled.reason.message : String(wsSettled.reason);
        const b = gcpSettled.reason instanceof Error ? gcpSettled.reason.message : String(gcpSettled.reason);
        throw new Error(`Workspace: ${a}; Cloud: ${b}`);
    }

    return { workspaceIncidents, gcpIncidents };
}

/**
 * Google does not publish an Antigravity-only status API. This monitor treats active Workspace
 * Gemini incidents and selected Gemini-related Cloud incidents as the official signal surface.
 *
 * @param {unknown} payload
 * @returns {ServiceHealthResult}
 */
export function evaluateGoogleAntigravity(payload) {
    const base = {
        id: 'google-antigravity',
        label: 'Google Antigravity',
        level: /** @type {HealthLevel} */ ('ok'),
        sinceUnixSec: null,
        headline: null,
        incidentUrl: 'https://www.google.com/appsstatus/dashboard',
    };

    if (!payload || typeof payload !== 'object') {
        return {
            ...base,
            level: 'unknown',
            headline: 'Unexpected response from Google status feeds.',
        };
    }

    const p = /** @type {GoogleAntigravityPayload & Record<string, unknown>} */ (payload);
    if (!Array.isArray(p.workspaceIncidents) || !Array.isArray(p.gcpIncidents)) {
        return {
            ...base,
            level: 'unknown',
            headline: 'Unexpected response from Google status feeds.',
        };
    }

    /** @type {{ level: HealthLevel, since: number | null, headline: string, url: string }[]} */
    const hits = [];

    const consider = (raw, kind) => {
        const inc = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!inc) return;
        if (!googleIncidentIsActive(inc)) return;
        const touch =
            kind === 'workspace'
                ? googleWorkspaceIncidentTouchesAntigravity(inc)
                : googleCloudIncidentTouchesAntigravity(inc);
        if (!touch) return;
        hits.push({
            level: levelFromGoogleIncident(inc),
            since: parseGoogleIncidentBeginUnix(inc),
            headline: headlineFromGoogleIncident(inc),
            url: googleIncidentDetailUrl(inc, kind),
        });
    };

    for (const row of p.workspaceIncidents) consider(row, 'workspace');
    for (const row of p.gcpIncidents) consider(row, 'gcp');

    if (hits.length === 0) {
        return base;
    }

    let worst = 'ok';
    for (const h of hits) worst = worstLevel(worst, h.level);

    if (worst === 'ok') {
        return base;
    }

    const atWorst = hits.filter((h) => h.level === worst);
    let pick = atWorst[0];
    let earliest = pick.since;
    for (const h of atWorst) {
        if (h.since !== null && (earliest === null || h.since < earliest)) {
            earliest = h.since;
            pick = h;
        }
    }

    return {
        ...base,
        level: worst,
        sinceUnixSec: earliest,
        headline: pick.headline,
        incidentUrl: pick.url,
    };
}

/**
 * @param {string} indicator Statuspage page `status.indicator`
 * @returns {HealthLevel}
 */
function levelFromCloudflareIndicator(indicator) {
    const i = String(indicator || '').toLowerCase();
    switch (i) {
        case 'none':
            return 'ok';
        case 'minor':
        case 'maintenance':
            return 'disrupted';
        case 'major':
        case 'critical':
            return 'down';
        default:
            return 'unknown';
    }
}

/**
 * @param {string} impact Statuspage incident `impact`
 * @returns {HealthLevel}
 */
function levelFromCloudflareIncidentImpact(impact) {
    const i = String(impact || '').toLowerCase();
    switch (i) {
        case 'none':
            return 'ok';
        case 'minor':
            return 'disrupted';
        case 'major':
        case 'critical':
            return 'down';
        default:
            return 'unknown';
    }
}

/**
 * Cloudflare-only: ignore minor/maintenance page indicators (often driven by regional POP noise).
 * @param {string} indicator
 * @returns {HealthLevel}
 */
function levelFromCloudflareStrictPageIndicator(indicator) {
    const i = String(indicator || '').toLowerCase();
    switch (i) {
        case 'none':
        case 'minor':
        case 'maintenance':
            return 'ok';
        case 'major':
            return 'disrupted';
        case 'critical':
            return 'down';
        default:
            return 'unknown';
    }
}

/**
 * Cloudflare-only: only major/critical incidents count; minor is treated as ok here.
 * @param {string} impact
 * @returns {HealthLevel}
 */
function levelFromCloudflareIncidentImpactStrict(impact) {
    const i = String(impact || '').toLowerCase();
    switch (i) {
        case 'major':
            return 'disrupted';
        case 'critical':
            return 'down';
        default:
            return 'ok';
    }
}

/**
 * @param {string} status Statuspage component `status`
 * @returns {HealthLevel}
 */
function levelFromCloudflareComponentStatus(status) {
    const s = String(status || '').toLowerCase();
    switch (s) {
        case 'operational':
        case 'under_maintenance':
            return 'ok';
        case 'degraded_performance':
        case 'partial_outage':
            return 'disrupted';
        case 'major_outage':
            return 'down';
        default:
            return 'unknown';
    }
}

/**
 * @param {unknown[]} components `summary.json` top-level `components`
 * @returns {string | null} id of the "Cloudflare Sites and Services" group, or null
 */
function resolveCloudflareGlobalSitesGroupId(components) {
    if (!Array.isArray(components)) return null;
    for (const raw of components) {
        const c = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!c) continue;
        if (c.group === true && String(c.name || '') === 'Cloudflare Sites and Services') {
            return String(c.id || '') || null;
        }
    }
    return null;
}

/**
 * @param {Record<string, unknown>} c component object from summary or incident
 * @param {string | null} globalGroupId
 */
function cloudflareComponentIsUnderGlobalSites(c, globalGroupId) {
    if (!globalGroupId) return false;
    const id = String(c.id || '');
    const gid = c.group_id != null && c.group_id !== '' ? String(c.group_id) : '';
    return id === globalGroupId || gid === globalGroupId;
}

/**
 * True if the incident touches Dashboard, Workers, etc. (not only POPs / regional infra).
 * @param {Record<string, unknown>} inc
 * @param {string | null} globalGroupId
 */
function cloudflareIncidentTouchesGlobalProducts(inc, globalGroupId) {
    const comps = inc.components;
    if (!Array.isArray(comps) || comps.length === 0) return true;
    for (const raw of comps) {
        const c = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!c) continue;
        if (globalGroupId && cloudflareComponentIsUnderGlobalSites(c, globalGroupId)) return true;
        const name = String(c.name || '');
        if (name.startsWith('Cloudflare Sites and Services')) return true;
    }
    return false;
}

/**
 * @typedef {{ id: string, label: string, incidentUrl: string, feedName: string }} StatuspageSummaryConfig
 */

/**
 * Statuspage API v2 `summary.json` (Cloudflare, Anthropic, etc.).
 * @param {unknown} payload
 * @param {StatuspageSummaryConfig} cfg
 * @returns {ServiceHealthResult}
 */
function evaluateStatuspageSummary(payload, cfg) {
    const base = {
        id: cfg.id,
        label: cfg.label,
        level: /** @type {HealthLevel} */ ('ok'),
        sinceUnixSec: null,
        headline: null,
        incidentUrl: cfg.incidentUrl,
    };

    if (!payload || typeof payload !== 'object') {
        return {
            ...base,
            level: 'unknown',
            headline: `Unexpected response from ${cfg.feedName}.`,
        };
    }

    const p = /** @type {Record<string, unknown>} */ (payload);
    const st = p.status && typeof p.status === 'object' ? /** @type {Record<string, unknown>} */ (p.status) : null;
    if (!st || typeof st.indicator === 'undefined') {
        return {
            ...base,
            level: 'unknown',
            headline: `Unexpected response from ${cfg.feedName}.`,
        };
    }

    let level = levelFromCloudflareIndicator(String(st.indicator));
    const description = String(st.description || '').trim();

    const incidents = Array.isArray(p.incidents) ? p.incidents : [];
    /** @type {number | null} */
    let sinceUnixSec = null;
    /** @type {string | null} */
    let incidentHeadline = null;

    for (const raw of incidents) {
        const inc = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!inc) continue;
        level = worstLevel(level, levelFromCloudflareIncidentImpact(String(inc.impact || '')));
        const created = Date.parse(String(inc.created_at || ''));
        const t = Number.isFinite(created) ? Math.floor(created / 1000) : null;
        if (t !== null && (sinceUnixSec === null || t < sinceUnixSec)) sinceUnixSec = t;
        const name = String(inc.name || '').trim();
        if (name && !incidentHeadline) incidentHeadline = name;
    }

    if (level === 'ok') {
        return base;
    }

    const headline =
        incidentHeadline ||
        (description || (level === 'unknown' ? `Unknown ${cfg.label} status` : `${cfg.label} service issue`));

    return {
        ...base,
        level,
        sinceUnixSec,
        headline,
    };
}

/**
 * Cloudflare Statuspage `summary.json`: ignore minor page state and regional/POP-only issues.
 * Escalates only for major/critical page indicator, major/critical incidents on global products,
 * or degraded status on components under "Cloudflare Sites and Services".
 *
 * @param {unknown} payload Cloudflare Statuspage `summary.json`
 * @returns {ServiceHealthResult}
 */
export function evaluateCloudflare(payload) {
    const cfg = {
        id: 'cloudflare',
        label: 'Cloudflare',
        incidentUrl: 'https://www.cloudflarestatus.com/',
        feedName: 'Cloudflare status feed',
    };

    const base = {
        id: cfg.id,
        label: cfg.label,
        level: /** @type {HealthLevel} */ ('ok'),
        sinceUnixSec: null,
        headline: null,
        incidentUrl: cfg.incidentUrl,
    };

    if (!payload || typeof payload !== 'object') {
        return {
            ...base,
            level: 'unknown',
            headline: `Unexpected response from ${cfg.feedName}.`,
        };
    }

    const p = /** @type {Record<string, unknown>} */ (payload);
    const st = p.status && typeof p.status === 'object' ? /** @type {Record<string, unknown>} */ (p.status) : null;
    if (!st || typeof st.indicator === 'undefined') {
        return {
            ...base,
            level: 'unknown',
            headline: `Unexpected response from ${cfg.feedName}.`,
        };
    }

    const components = Array.isArray(p.components) ? p.components : [];
    const globalSitesGroupId = resolveCloudflareGlobalSitesGroupId(components);

    /** @type {HealthLevel} */
    let level = levelFromCloudflareStrictPageIndicator(String(st.indicator));
    const description = String(st.description || '').trim();

    const incidents = Array.isArray(p.incidents) ? p.incidents : [];
    /** @type {number | null} */
    let sinceUnixSec = null;
    /** @type {string | null} */
    let incidentHeadline = null;

    for (const raw of incidents) {
        const inc = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
        if (!inc) continue;
        if (String(inc.status || '').toLowerCase() === 'resolved') continue;
        const incLevel = levelFromCloudflareIncidentImpactStrict(String(inc.impact || ''));
        if (incLevel === 'ok') continue;
        if (!cloudflareIncidentTouchesGlobalProducts(inc, globalSitesGroupId)) continue;
        level = worstLevel(level, incLevel);
        const created = Date.parse(String(inc.created_at || ''));
        const t = Number.isFinite(created) ? Math.floor(created / 1000) : null;
        if (t !== null && (sinceUnixSec === null || t < sinceUnixSec)) sinceUnixSec = t;
        const name = String(inc.name || '').trim();
        if (name && !incidentHeadline) incidentHeadline = name;
    }

    if (globalSitesGroupId) {
        for (const raw of components) {
            const c = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
            if (!c) continue;
            if (!cloudflareComponentIsUnderGlobalSites(c, globalSitesGroupId)) continue;
            const compLevel = levelFromCloudflareComponentStatus(String(c.status || ''));
            if (compLevel === 'ok') continue;
            level = worstLevel(level, compLevel);
            const updated = Date.parse(String(c.updated_at || ''));
            const tu = Number.isFinite(updated) ? Math.floor(updated / 1000) : null;
            if (tu !== null && (sinceUnixSec === null || tu < sinceUnixSec)) sinceUnixSec = tu;
            const compName = String(c.name || '').trim();
            if (compName && !incidentHeadline) incidentHeadline = compName;
        }
    }

    if (level === 'ok') {
        return base;
    }

    const headline =
        incidentHeadline ||
        (description || (level === 'unknown' ? `Unknown ${cfg.label} status` : `${cfg.label} service issue`));

    return {
        ...base,
        level,
        sinceUnixSec,
        headline,
    };
}

/**
 * @param {unknown} payload Anthropic Statuspage `summary.json`
 * @returns {ServiceHealthResult}
 */
export function evaluateAnthropic(payload) {
    return evaluateStatuspageSummary(payload, {
        id: 'anthropic',
        label: 'Anthropic',
        incidentUrl: 'https://status.anthropic.com/',
        feedName: 'Anthropic status feed',
    });
}

/**
 * @param {typeof fetch} fetchFn
 * @returns {Promise<unknown>}
 */
export async function fetchCloudflareStatusSummary(fetchFn) {
    return fetchJsonWithProxy(fetchFn, CLOUDFLARE_STATUS_SUMMARY_URL);
}

/**
 * @param {typeof fetch} fetchFn
 * @returns {Promise<unknown>}
 */
export async function fetchAnthropicStatusSummary(fetchFn) {
    return fetchJsonWithProxy(fetchFn, ANTHROPIC_STATUS_SUMMARY_URL);
}

/** @type {HealthSource[]} */
export const DEFAULT_HEALTH_SOURCES = [
    {
        id: 'aws-health',
        label: 'AWS Health',
        note: 'Amazon Bedrock provides LLM inference for multiple models and is commonly used in the Weyland model mix.',
        fetchPayload: fetchAwsCurrentEvents,
        monitors: [{ id: 'amazon-bedrock', label: 'Amazon Bedrock', evaluate: evaluateAmazonBedrock }],
    },
    {
        id: 'google-antigravity',
        label: 'Google Status',
        note: 'Google Antigravity provides LLM inference for multiple models and is commonly used in the Weyland model mix.',
        fetchPayload: fetchGoogleAntigravityBundle,
        monitors: [{ id: 'google-antigravity', label: 'Google Antigravity', evaluate: evaluateGoogleAntigravity }],
    },
    {
        id: 'anthropic-status',
        label: 'Anthropic Status',
        note: 'Weyland model mixes do not generally include inferrence directly from Anthropic, but some users use it directly.',
        fetchPayload: fetchAnthropicStatusSummary,
        monitors: [{ id: 'anthropic', label: 'Anthropic', evaluate: evaluateAnthropic }],
    },
    {
        id: 'cloudflare-status',
        label: 'Cloudflare Status',
        note: 'Cloudflare is a popular CDN and DNS provider for many up-stream services. Minor and localized issues are ignored.',
        fetchPayload: fetchCloudflareStatusSummary,
        monitors: [{ id: 'cloudflare', label: 'Cloudflare', evaluate: evaluateCloudflare }],
    },
];

/** @deprecated Use flattenMonitorsFromSources(DEFAULT_HEALTH_SOURCES) — kept for simple imports. */
export const SERVICE_HEALTH_MONITORS = flattenMonitorsFromSources(DEFAULT_HEALTH_SOURCES);

/**
 * @param {ArrayBuffer} buf
 * @param {string} contentType
 */
export function decodeAwsHealthJson(buf, contentType) {
    const ct = contentType || '';
    const u8 = new Uint8Array(buf);

    const tryDecode = (label) => {
        const dec = new TextDecoder(label);
        return dec.decode(buf);
    };

    if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
        return JSON.parse(tryDecode('utf-16le'));
    }
    if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
        return JSON.parse(new TextDecoder('utf-16be').decode(buf));
    }

    let text;
    if (/utf-16/i.test(ct)) {
        text = tryDecode('utf-16le');
    } else {
        text = tryDecode('utf-8');
    }
    try {
        return JSON.parse(text);
    } catch {
        if (!/utf-16/i.test(ct)) {
            return JSON.parse(tryDecode('utf-16le'));
        }
        throw new Error('Invalid JSON from AWS health feed');
    }
}

/**
 * @param {typeof fetch} fetchFn
 */
export async function fetchAwsCurrentEvents(fetchFn) {
    const target = AWS_PUBLIC_HEALTH_EVENTS_URL;
    const attempts = [
        () => fetchFn(target, { credentials: 'omit' }),
        () => fetchFn(`/proxy/${target}`, { credentials: 'include' }),
    ];
    let lastErr;
    for (const run of attempts) {
        try {
            const res = await run();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = decodeAwsHealthJson(await res.arrayBuffer(), res.headers.get('content-type') || '');
            return Array.isArray(json) ? json : [];
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

/**
 * UTF-8 JSON via direct fetch or SillyTavern /proxy/.
 * @param {typeof fetch} fetchFn
 * @param {string} url
 */
export async function fetchJsonWithProxy(fetchFn, url) {
    const attempts = [
        () => fetchFn(url, { credentials: 'omit' }),
        () => fetchFn(`/proxy/${url}`, { credentials: 'include' }),
    ];
    let lastErr;
    for (const run of attempts) {
        try {
            const res = await run();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = new TextDecoder('utf-8').decode(await res.arrayBuffer());
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

/**
 * @param {HealthMonitor} m
 * @param {string} sourceLabel
 * @param {unknown} err
 * @returns {ServiceHealthResult}
 */
function sourceFetchFailedResult(m, sourceLabel, err) {
    const msg = err instanceof Error ? err.message : String(err);
    let incidentUrl = 'https://www.google.com/appsstatus/dashboard';
    if (m.id === 'amazon-bedrock') incidentUrl = 'https://health.aws.amazon.com/health/status';
    if (m.id === 'google-antigravity') incidentUrl = 'https://www.google.com/appsstatus/dashboard';
    if (m.id === 'cloudflare') incidentUrl = 'https://www.cloudflarestatus.com/';
    if (m.id === 'anthropic') incidentUrl = 'https://status.anthropic.com/';
    return {
        id: m.id,
        label: m.label,
        level: 'unknown',
        sinceUnixSec: null,
        headline: `${sourceLabel}: ${msg}`,
        incidentUrl,
    };
}

/**
 * @param {HTMLElement} container
 * @param {ServiceHealthResult[]} results
 * @param {{ lastChecked: Date | null, fetchError: string | null }} meta
 */
export function renderServiceHealthPanel(container, results, meta) {
    const checked = meta.lastChecked ? escapeHtml(meta.lastChecked.toLocaleString()) : '—';
    const rows = results
        .map((r) => {
            const dotClass =
                r.level === 'ok'
                    ? 'wst-health-dot--ok'
                    : r.level === 'disrupted'
                      ? 'wst-health-dot--amber'
                      : r.level === 'down'
                        ? 'wst-health-dot--red'
                        : 'wst-health-dot--unknown';
            const label =
                r.level === 'ok'
                    ? 'Normal'
                    : r.level === 'disrupted'
                      ? 'Disrupted'
                      : r.level === 'down'
                        ? 'Down'
                        : 'Unknown';

            const detailLines = [];
            if (r.note) {
                detailLines.push(
                    `<div class="wst-health-line wst-health-note">${escapeHtml(r.note)}</div>`,
                );
            }
            if (r.level !== 'ok' && r.level !== 'unknown') {
                const since =
                    r.sinceUnixSec !== null
                        ? new Date(r.sinceUnixSec * 1000).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                          })
                        : 'Unknown Start Time';
                const safeHeadline = escapeHtml(r.headline || 'Ongoing Incident');
                detailLines.push(
                    `<div class="wst-health-line"><span class="wst-health-k">Since:</span> ${escapeHtml(since)}</div>`,
                    `<div class="wst-health-line"><span class="wst-health-k">Summary:</span> ${safeHeadline}</div>`,
                    `<div class="wst-health-line"><span class="wst-health-k">Report:</span> <a href="${escapeAttr(r.incidentUrl || '#')}" target="_blank" rel="noopener noreferrer">Service Health Page</a></div>`,
                );
            } else if (r.level === 'unknown' && r.headline) {
                const safeHeadline = escapeHtml(r.headline);
                detailLines.push(`<div class="wst-health-line"><span class="wst-health-k">Detail:</span> ${safeHeadline}</div>`);
                if (r.incidentUrl && r.incidentUrl !== '#') {
                    detailLines.push(
                        `<div class="wst-health-line"><a href="${escapeAttr(r.incidentUrl)}" target="_blank" rel="noopener noreferrer">Open Status Dashboard</a></div>`,
                    );
                }
            }
            const extra = detailLines.length ? `<div class="wst-health-extra">${detailLines.join('')}</div>` : '';
            const top = `<div class="wst-health-row-top">
                    <span class="wst-health-dot ${dotClass}" title="${escapeAttr(label)}"></span>
                    <span class="wst-health-name">${escapeHtml(r.label)}</span>
                    <span class="wst-health-state">${escapeHtml(label)}</span>
                </div>`;

            if (extra) {
                const openByDefault = r.level !== 'ok' ? ' open' : '';
                return `<details class="wst-health-row wst-health-row--foldable" data-service="${escapeAttr(r.id)}"${openByDefault}>
                <summary class="wst-health-row-summary">
                    <span class="wst-health-row-fold-icon fa-solid fa-chevron-right" aria-hidden="true"></span>
                    ${top}
                </summary>
                ${extra}
            </details>`;
            }

            return `<div class="wst-health-row" data-service="${escapeAttr(r.id)}">${top}</div>`;
        })
        .join('');

    const err = meta.fetchError
        ? `<div class="wst-health-error">
            <div class="wst-health-error-msg">${escapeHtml(meta.fetchError)}</div>
            <div class="wst-health-error-hint">Enable <code>enableCorsProxy</code> in SillyTavern <code>config.yaml</code> so this extension can access remote status data.</div>
        </div>`
        : '';

    container.innerHTML = `<div class="wst-health-foot">Last Updated: <span class="wst-health-checked">${checked}</span></div>
        ${err}<div class="wst-health-rows">${rows}</div>`;
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {string} s
 */
function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * @param {object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(results: ServiceHealthResult[]) => void} options.onUpdate
 * @param {(err: unknown) => void} [options.onError]
 * @param {number} [options.intervalMs]
 * @param {HealthSource[]} [options.sources] Defaults to DEFAULT_HEALTH_SOURCES
 * @returns {{ start: () => void, stop: () => void, refresh: () => Promise<void> }}
 */
export function createServiceHealthMonitor(options) {
    const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
    const intervalMs = options.intervalMs ?? 5 * 60 * 1000;
    const sources = options.sources || DEFAULT_HEALTH_SOURCES;
    let timer = null;

    const refresh = async () => {
        const chunks = await Promise.all(
            sources.map(async (src) => {
                try {
                    const payload = await src.fetchPayload(fetchImpl);
                    return src.monitors.map((m) => ({
                        ...m.evaluate(payload),
                        note: src.note != null ? String(src.note) : null,
                    }));
                } catch (e) {
                    return src.monitors.map((m) => ({
                        ...sourceFetchFailedResult(m, src.label, e),
                        note: src.note != null ? String(src.note) : null,
                    }));
                }
            }),
        );
        options.onUpdate(chunks.flat());
    };

    return {
        start() {
            if (timer) return;
            timer = setInterval(() => {
                refresh().catch((e) => options.onError?.(e));
            }, intervalMs);
            refresh().catch((e) => options.onError?.(e));
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
        },
        refresh,
    };
}
