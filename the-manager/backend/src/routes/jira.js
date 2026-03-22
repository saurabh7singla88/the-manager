import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const SETTING_KEYS = ['jira_base_url', 'jira_email', 'jira_api_token'];

// ─── Load JIRA settings from DB ──────────────────────────────────────────────
async function loadJiraSettings() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

// ─── Validate Atlassian base URL (SSRF guard) ───────────────────────────────
// Ensures the stored base URL is HTTPS and not pointing at a private/reserved address.
function validateAtlassianBaseUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw Object.assign(new Error('Invalid JIRA base URL.'), { status: 400 });
  }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('JIRA base URL must use HTTPS.'), { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,                        // IPv4 loopback
    /^::1$/,                         // IPv6 loopback
    /^0\.0\.0\.0$/,
    /^169\.254\./,                   // link-local / AWS IMDS
    /^10\./,                         // RFC1918
    /^172\.(1[6-9]|2\d|3[01])\./,   // RFC1918
    /^192\.168\./,                   // RFC1918
    /^fc00:/i,                        // IPv6 ULA
    /^fe80:/i,                        // IPv6 link-local
  ];
  if (blocked.some(re => re.test(host))) {
    throw Object.assign(new Error('JIRA base URL points to a private or reserved address.'), { status: 400 });
  }
  // Return normalized URL without trailing slash (preserving any path prefix)
  return parsed.href.replace(/\/+$/, '');
}

// ─── GET /api/jira/settings ───────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await loadJiraSettings();
    res.json({
      baseUrl:      settings['jira_base_url'] || '',
      email:        settings['jira_email'] || '',
      apiTokenSet:  !!(settings['jira_api_token']),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/jira/settings ───────────────────────────────────────────────────
router.put('/settings', async (req, res, next) => {
  try {
    const { baseUrl, email, apiToken } = req.body;

    const upserts = [];

    if (baseUrl !== undefined) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_base_url' },
        update: { value: baseUrl.trim() },
        create: { key: 'jira_base_url', value: baseUrl.trim() },
      }));
    }

    if (email !== undefined) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_email' },
        update: { value: email.trim() },
        create: { key: 'jira_email', value: email.trim() },
      }));
    }

    if (apiToken) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_api_token' },
        update: { value: apiToken },
        create: { key: 'jira_api_token', value: apiToken },
      }));
    }

    await Promise.all(upserts);

    const settings = await loadJiraSettings();
    res.json({
      baseUrl:      settings['jira_base_url'] || '',
      email:        settings['jira_email'] || '',
      apiTokenSet:  !!(settings['jira_api_token']),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jira/fetch/:ticketKey ──────────────────────────────────────────
// Proxy request to JIRA API - fetch ticket details
router.get('/fetch/:ticketKey', async (req, res, next) => {
  try {
    const { ticketKey } = req.params;

    // Validate ticket key format (e.g. PROJ-123)
    if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(ticketKey)) {
      return res.status(400).json({ error: 'Invalid JIRA ticket key format. Expected format: PROJECT-123' });
    }

    const settings = await loadJiraSettings();

    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA is not configured. Please set up JIRA credentials in Settings.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let jiraRes;
    try {
      jiraRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey.toUpperCase())}?fields=summary,description,status,priority,assignee,issuetype,updated,labels,components,fixVersions,reporter`,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (jiraRes.status === 401) {
      return res.status(401).json({ error: 'JIRA authentication failed. Check your email and API token.' });
    }
    if (jiraRes.status === 403) {
      return res.status(403).json({ error: 'Access denied to this JIRA ticket. Check your permissions.' });
    }
    if (jiraRes.status === 404) {
      return res.status(404).json({ error: `JIRA ticket "${ticketKey.toUpperCase()}" not found.` });
    }
    if (!jiraRes.ok) {
      logger.error('JIRA API error', { status: jiraRes.status, ticketKey });
      return res.status(502).json({ error: `JIRA API returned status ${jiraRes.status}` });
    }

    const data = await jiraRes.json();
    const fields = data.fields || {};

    // Extract description text from Atlassian Document Format (ADF) or plain text
    const extractDescription = (desc) => {
      if (!desc) return '';
      if (typeof desc === 'string') return desc;
      // ADF format - extract text nodes
      const texts = [];
      const walk = (node) => {
        if (!node) return;
        if (node.type === 'text' && node.text) texts.push(node.text);
        if (node.content) node.content.forEach(walk);
      };
      walk(desc);
      return texts.join('').trim();
    };

    const ticket = {
      key:          data.key,
      url:          `${baseUrl}/browse/${data.key}`,
      summary:      fields.summary || '',
      description:  extractDescription(fields.description),
      status:       fields.status?.name || '',
      statusCategory: fields.status?.statusCategory?.name || '',
      priority:     fields.priority?.name || '',
      issueType:    fields.issuetype?.name || '',
      assignee:     fields.assignee?.displayName || null,
      reporter:     fields.reporter?.displayName || null,
      labels:       fields.labels || [],
      components:   (fields.components || []).map(c => c.name),
      fixVersions:  (fields.fixVersions || []).map(v => v.name),
      updated:      fields.updated || null,
    };

    res.json(ticket);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'JIRA request timed out. Check your base URL and network access.' });
    }
    next(err);
  }
});

// ─── GET /api/jira/confluence/fetch?url=<pageUrl|pageId> ─────────────────────
// Fetch a Confluence page by URL or page ID. Reuses the same JIRA credentials
// since Atlassian Cloud shares auth across JIRA + Confluence on the same instance.
router.get('/confluence/fetch', async (req, res, next) => {
  try {
    const { url: rawInput } = req.query;
    if (!rawInput?.trim()) {
      return res.status(400).json({ error: 'Provide a Confluence page URL or page ID.' });
    }

    const settings = await loadJiraSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA/Confluence credentials are not configured. Set them up in Settings.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

    // Parse page ID from URL patterns:
    //   /wiki/spaces/SPACE/pages/123456789/Page-Title
    //   /wiki/spaces/SPACE/pages/123456789
    //   /pages/viewpage.action?pageId=123456789
    //   or just a numeric ID
    let pageId = null;
    const input = rawInput.trim();

    const pagesMatch = input.match(/\/pages\/(\d+)/);
    const viewMatch  = input.match(/[?&]pageId=(\d+)/);
    if (pagesMatch)    pageId = pagesMatch[1];
    else if (viewMatch) pageId = viewMatch[1];
    else if (/^\d+$/.test(input)) pageId = input;

    if (!pageId) {
      return res.status(400).json({ error: 'Could not extract a page ID from the provided URL or input. Paste the full Confluence page URL or just the numeric page ID.' });
    }

    // Detect whether instance is Cloud (/wiki prefix) or Server (no /wiki prefix)
    // Try Cloud first, fall back to Server path
    const confluenceBase = `${baseUrl}/wiki`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let cfRes;
    try {
      cfRes = await fetch(
        `${confluenceBase}/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
        { headers, signal: controller.signal }
      );
      // If Cloud path fails with 404 try Server (no /wiki) path
      if (cfRes.status === 404) {
        cfRes = await fetch(
          `${baseUrl}/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
          { headers, signal: controller.signal }
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (cfRes.status === 401) {
      return res.status(401).json({ error: 'Confluence authentication failed. Check your email and API token.' });
    }
    if (cfRes.status === 403) {
      return res.status(403).json({ error: 'Access denied to this Confluence page.' });
    }
    if (cfRes.status === 404) {
      return res.status(404).json({ error: `Confluence page ID "${pageId}" not found.` });
    }
    if (!cfRes.ok) {
      return res.status(502).json({ error: `Confluence API returned status ${cfRes.status}` });
    }

    const data = await cfRes.json();

    // Strip HTML tags from body preview
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    };

    // Detect actual page URL
    const selfLink = data._links?.base
      ? `${data._links.base}${data._links?.webui || ''}`
      : `${confluenceBase}/pages/${pageId}`;

    const page = {
      id:          data.id,
      key:         data.id,
      url:         selfLink,
      title:       data.title || '',
      space:       data.space?.name || data.space?.key || '',
      spaceKey:    data.space?.key || '',
      version:     data.version?.number || null,
      lastUpdated: data.version?.when || null,
      excerpt:     stripHtml(data.body?.view?.value),
      ancestors:   (data.ancestors || []).map(a => a.title),
    };

    res.json(page);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Confluence request timed out.' });
    }
    next(err);
  }
});

export default router;
