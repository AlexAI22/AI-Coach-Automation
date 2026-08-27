/**
 * App routes the suite navigates to directly.
 *
 * Kept in one place because a rename is invisible: the app does NOT 404 on a
 * stale path — it keeps the URL and renders the Customer Value Portal LIST
 * instead, so the only symptom is whatever the destination page was supposed to
 * show never appearing, while the URL still looks correct.
 */

/**
 * Customer account detail page, addressed by `id` + `id_type=SourceGGP` (not
 * `ggp_id`). Renamed from `/customer-value-portal/account` in Aug 2026.
 */
export const CUSTOMER_ACCOUNT_PATH = '/customer-value-portal/customer';

/** Customer Value Portal customer list. */
export const CUSTOMER_VALUE_PORTAL_PATH = '/customer-value-portal';
