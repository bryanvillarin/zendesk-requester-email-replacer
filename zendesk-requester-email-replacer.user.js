// ==UserScript==
// @name         Zendesk Requester Email Replacer
// @namespace    https://github.com/bryanvillarin/zendesk-requester-email-replacer
// @version      1.4
// @description  Replaces requester display names with email addresses in Zendesk Support list views and ticket pages
// @author       Bryan Villarin
// @homepage     https://bryanvillarin.link
// @supportURL   https://bryanvillarin.link/contact/
// @license      MIT
// @match        https://*.zendesk.com/agent/*
// @updateURL     https://raw.githubusercontent.com/bryanvillarin/zendesk-requester-email-replacer/main/zendesk-requester-email-replacer.user.js
// @downloadURL   https://raw.githubusercontent.com/bryanvillarin/zendesk-requester-email-replacer/main/zendesk-requester-email-replacer.user.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const VIEW_PATH_RE = /\/agent\/filters\/(\d+)/;
  const TICKET_PATH_RE = /\/agent\/tickets\/(\d+)/;
  const ROW_ID_RE = /generic-table-row-(\d+)/;
  const TBODY = 'tbody[data-test-id="generic-table-body"]';
  const TICKET_REQ_SELECTOR = 'span[data-test-id="tabs-nav-item-users"] span.react-wrapper';
  const TICKET_SIDEBAR_REQ_SELECTOR = '[data-test-id="ticket-system-field-requester-select"] div[data-garden-id="typography.ellipsis"]';
  const DEBOUNCE_MS = 500;
  const POLL_MS = 1000;

  const emailCache = new Map();       // userId → email
  const nameCache = new Map();         // userId → name
  const ticketReqCache = new Map();    // ticketId → requesterId
  let tableObserver = null;
  let ticketObserver = null;
  let isFetching = false;
  let lastPath = null;
  
// --- API ---

  async function fetchViewData(viewId) {
    const r = await fetch(`/api/v2/views/${viewId}/execute.json`);
    if (!r.ok) return;
    const d = await r.json();
    const newUserIds = new Set();
    for (const row of d.rows) {
      if (row.ticket?.id && row.requester_id) {
        ticketReqCache.set(row.ticket.id, row.requester_id);
        if (!emailCache.has(row.requester_id)) newUserIds.add(row.requester_id);
      }
    }
    if (newUserIds.size) await fetchEmails([...newUserIds]);
  }

  async function fetchTicketRequester(ticketId) {
    if (ticketReqCache.has(ticketId) && emailCache.has(ticketReqCache.get(ticketId))) return;
    const r = await fetch(`/api/v2/tickets/${ticketId}.json`);
    if (!r.ok) return;
    const d = await r.json();
    if (d.ticket?.requester_id) {
      ticketReqCache.set(ticketId, d.ticket.requester_id);
      if (!emailCache.has(d.ticket.requester_id)) {
        await fetchEmails([d.ticket.requester_id]);
      }
    }
  }

  async function fetchTickets(ticketIds) {
    const r = await fetch(`/api/v2/tickets/show_many.json?ids=${ticketIds.join(",")}`);
    if (!r.ok) return;
    const d = await r.json();
    const newUserIds = new Set();
    for (const t of d.tickets) {
      ticketReqCache.set(t.id, t.requester_id);
      if (!emailCache.has(t.requester_id)) newUserIds.add(t.requester_id);
    }
    if (newUserIds.size) await fetchEmails([...newUserIds]);
  }

  async function fetchEmails(userIds) {
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const r = await fetch(`/api/v2/users/show_many.json?ids=${batch.join(",")}`);
      if (!r.ok) continue;
      const d = await r.json();
      for (const u of d.users) {
        if (u.email) emailCache.set(u.id, u.email);
        if (u.name) nameCache.set(u.id, u.name);
      }
    }
  }

// --- DOM: List Views ---

  function getRequesterColIndex() {
    const headers = document.querySelectorAll("thead th");
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].textContent.trim() === "Requester") return i;
    }
    return -1;
  }

  function replaceNamesInView() {
    const colIndex = getRequesterColIndex();
    if (colIndex === -1) return [];

    const unresolved = [];
    const rows = document.querySelectorAll('tr[aria-describedby^="generic-table-row-"]');

    for (const row of rows) {
      const m = row.getAttribute("aria-describedby")?.match(ROW_ID_RE);
      if (!m) continue;
      const ticketId = parseInt(m[1], 10);

      const cells = row.querySelectorAll("td");
      const cell = cells[colIndex];
      if (!cell || cell.dataset.emailReplaced === "true") continue;

      const reqId = ticketReqCache.get(ticketId);
      if (!reqId) { unresolved.push(ticketId); continue; }

      const email = emailCache.get(reqId);
      if (!email) { unresolved.push(ticketId); continue; }

      cell.textContent = email;
      if (cell.hasAttribute("aria-label")) cell.setAttribute("aria-label", email);
      cell.dataset.emailReplaced = "true";
    }

    return unresolved;
  }

  async function processViewRows() {
    if (isFetching) return;
    const unresolved = replaceNamesInView();
    if (!unresolved.length) return;

    isFetching = true;
    try {
      await fetchTickets(unresolved);
      replaceNamesInView();
    } finally {
      isFetching = false;
    }
  }

// --- DOM: Single Ticket ---

  function replaceNamesOnTicket(ticketId) {
    const reqId = ticketReqCache.get(ticketId);
    if (!reqId) return false;

    const email = emailCache.get(reqId);
    const name = nameCache.get(reqId);
    if (!email || !name) return false;

    let replaced = false;

    // Tab bar elements
    document.querySelectorAll(TICKET_REQ_SELECTOR).forEach(el => {
      if (el.dataset.emailReplaced === "true") return;
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === name) {
          node.textContent = email;
          el.dataset.emailReplaced = "true";
          replaced = true;
        }
      }
    });

    // Sidebar elements
    document.querySelectorAll(TICKET_SIDEBAR_REQ_SELECTOR).forEach(el => {
      if (el.dataset.emailReplaced === "true") return;
      if (el.textContent.trim() === name) {
        el.textContent = email;
        if (el.hasAttribute("title")) el.setAttribute("title", email);
        el.dataset.emailReplaced = "true";
        replaced = true;
      }
    });

    return replaced;
  }

  function clearTicketReplacements() {
    document.querySelectorAll(TICKET_REQ_SELECTOR).forEach(el => {
      delete el.dataset.emailReplaced;
    });
    document.querySelectorAll(TICKET_SIDEBAR_REQ_SELECTOR).forEach(el => {
      delete el.dataset.emailReplaced;
    });
  }

// --- Utilities ---

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function waitFor(sel, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const el = document.querySelector(sel);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error("Timeout: " + sel)); }, timeout);
    });
  }

  // --- Observers ---

  const debouncedProcessView = debounce(processViewRows, DEBOUNCE_MS);

  function observeTable() {
    if (tableObserver) tableObserver.disconnect();
    const tbody = document.querySelector(TBODY);
    if (!tbody) return;
    tableObserver = new MutationObserver(debouncedProcessView);
    tableObserver.observe(tbody, { childList: true, subtree: true });
  }

  function observeTicket(ticketId) {
    if (ticketObserver) ticketObserver.disconnect();
    const debouncedReplace = debounce(() => {
      clearTicketReplacements();
      replaceNamesOnTicket(ticketId);
    }, DEBOUNCE_MS);
    ticketObserver = new MutationObserver(debouncedReplace);
    const header = document.querySelector('span[data-test-id="tabs-nav-item-users"]')?.closest("nav, header");
    if (header) {
      ticketObserver.observe(header, { childList: true, subtree: true, characterData: true });
    }
  }

  function disconnectAll() {
    if (tableObserver) { tableObserver.disconnect(); tableObserver = null; }
    if (ticketObserver) { ticketObserver.disconnect(); ticketObserver = null; }
  }

  // --- Init ---

  async function handleView(viewId) {
    await fetchViewData(viewId);
    replaceNamesInView();
    observeTable();
  }
  
  async function handleTicket(ticketId) {
    const id = parseInt(ticketId, 10);
    clearTicketReplacements();
    await fetchTicketRequester(id);
    replaceNamesOnTicket(id);
    observeTicket(id);

    // Retry a few times for elements that render late
    let retries = 3;
    const retry = setInterval(() => {
      clearTicketReplacements();
      replaceNamesOnTicket(id);
      retries--;
      if (retries <= 0) clearInterval(retry);
    }, 500);
  }


  (function poll() {
    setInterval(async () => {
      const path = location.pathname;
      if (path === lastPath) return;
      lastPath = path;
      disconnectAll();

      try {
        const viewMatch = path.match(VIEW_PATH_RE);
        if (viewMatch) {
          await waitFor(TBODY);
          await handleView(viewMatch[1]);
          return;
        }

        const ticketMatch = path.match(TICKET_PATH_RE);
        if (ticketMatch) {
          await waitFor(TICKET_REQ_SELECTOR);
          await handleTicket(ticketMatch[1]);
          return;
        }
      } catch (e) {
        console.error("[ZD Email]", e);
      }
    }, POLL_MS);
  })();
})();