# Zendesk Requester Email Replacer

Tampermonkey userscript that replaces requester display names with email addresses in Zendesk Support list views, ticket pages, and search results. Uses the Zendesk API to fetch and cache requester emails.

## How It Works

1. **List views** (`/agent/filters/{id}`): Detects the "Requester" column, fetches requester emails via the Zendesk API, and replaces display names with email addresses.
2. **Ticket pages** (`/agent/tickets/{id}`): Replaces the requester name in the tab bar and the ticket properties sidebar with their email address.
3. **Search results** (`/agent/search/{id}`): Detects the "Requester" column and replaces display names with email addresses.

Fetched emails are cached to minimize API calls.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Click [`zendesk-requester-email-replacer.user.js`](https://raw.githubusercontent.com/bryanvillarin/zendesk-requester-email-replacer/main/zendesk-requester-email-replacer.user.js).
3. When Tampermonkey prompts you to install, click **Install**.
4. Navigate to a Zendesk Support list view, ticket page, or search results page.

The script runs automatically. No config needed.

## Known Limitations

| Limitation | Impact |
|-----------|--------|
| **Flash of original names** | Requester names appear briefly (~1 second) before being replaced with emails. |
| **Execute View returns page 1 only** | Views with many tickets rely on a fallback API call for rows beyond the first page. |
| **Rate limits** | Execute View is limited to 5 requests/min/view/agent (shared with Zendesk UI). Rapid view switching may temporarily delay replacements. |
| **Views without a Requester column** | Script does nothing — this is expected. |
| **Users without an email** | The original display name is kept. |

## API Usage

This script makes Zendesk API calls to fetch requester emails. All calls are read-only (GET requests) and are minimized through in-session caching — already-fetched emails are reused without additional calls.

| Action | API calls |
|--------|-----------|
| Loading a list view | Up to 2 (Execute View + Show Many Users) |
| Paginating a list view | Up to 2 (Show Many Tickets + Show Many Users) |
| Loading a ticket page | Up to 2 (Show Ticket + Show Many Users) |
| Loading search results | Up to 2 (Show Many Tickets + Show Many Users) |
| Revisiting any page with cached requesters | 0–1 |

On a Zendesk Enterprise plan (700 requests/minute account-wide limit), this script's footprint is negligible for small teams. If your instance is on a lower-tier plan or has many integrations already consuming API budget, monitor your `X-Rate-Limit-Remaining` response header before deploying broadly.

## Version History

| Version | Changes |
|---------|---------|
| **1.7** | Added delay between batched API calls to smooth out request bursts. |
| **1.6** | Added search results page support. Fixed requester column detection for views with multiple tables. |
| **1.5** | Fixed poll recovery — resets on `waitFor` timeout so the script retries instead of staying idle. |
| **1.4** | Fixed timing issue on ticket pages — retries replacement for late-rendering elements. |
| **1.3** | Fixed multi-tab ticket bug — uses name matching instead of first-element targeting. Added sidebar requester replacement on ticket pages. |
| **1.2** | Added single ticket page support — replaces requester name at the top of the ticket. |
| **1.1** | Fixed requester column detection — uses header-based column index instead of `aria-label` selector to avoid collisions with other columns. |
| **1.0** | Initial release — replaces requester names with email addresses in list views. |

## Contributing

Found a bug? Have an idea?

- Open an issue on GitHub
- Reach out: [bryanvillarin.link/contact](https://bryanvillarin.link/contact/)

## License

MIT License — see the script header for details.

---

* **Bryan Villarin**
* [bryanvillarin.link](https://bryanvillarin.link) · [allnarfedup.blog](https://allnarfedup.blog)