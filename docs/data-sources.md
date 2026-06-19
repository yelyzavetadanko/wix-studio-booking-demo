# Data sources for demo fixtures

Baseline seeds are in `seed-csv/` (from project documentation).

## Recommended Wix CMS exports (when available)

| Collection | File name in seed-csv |
|------------|----------------------|
| Rooms | `rooms-seed.csv` |
| PackageProducts | `package-products-seed.csv` |
| PackageSessions | `package-sessions-seed-sample.csv` |
| PricingRules | `pricing-rules-seed.csv` |
| ActivityCatalog | `activity-catalog-seed.csv` |
| RetreatProducts | `retreat-products-seed-template.csv` |
| RetreatSessions | `retreat-sessions-seed-template.csv` |
| InventoryBlocks | `inventory-blocks-seed-template.csv` |
| InventoryUnitClosures | export as CSV when populated |

After adding/updating CSV files, run:

```bash
npm run fixtures
```

## Anonymization

Before publishing, remove PII from any real booking/enquiry exports. Demo submit writes synthetic records only.
