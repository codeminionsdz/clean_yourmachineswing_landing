# Algeria administrative dataset

`algeria-wilayas-communes.json` is the bilingual Wilaya + Commune export from:

- Source: https://github.com/islam-re/Algeria-wilayas
- File: `json/wilaya-commune/wilaya-commune.json`
- License: MIT
- Administrative basis: Law 26-06, April 4, 2026, Journal Officiel No. 25
- Counts: 69 wilayas and 1,541 communes

The dataset's `code` values are Algerian administrative codes. They are only used for the customer-facing selection and are never sent as ZR Express territory UUIDs. The order form submits the selected French/Latin Wilaya and Commune names; the server resolves ZR territory IDs through the ZR territories API.
