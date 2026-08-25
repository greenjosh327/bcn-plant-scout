# BCN Google Ads Campaign Tools

Small local tools for auditing and safely managing the Base Camp North Google Ads campaign:

- Customer ID: `7759794615`
- Campaign ID: `24184686637`
- Campaign name: `BCN | Native Seeds | Search`

These scripts do not enable the campaign. Mutations require `--execute`, and mutation code refuses to run unless the live campaign ID and name match the expected values.

## Setup

```powershell
cd C:\BCNPlantTracker\bcn-website\scripts\google_ads
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item google-ads.example.yaml google-ads.yaml
```

Then edit `google-ads.yaml` locally with the Google Ads API credentials. The real `google-ads.yaml` file is ignored by Git.

The official Google Ads Python client can load credentials from YAML or environment variables. These scripts prefer the local `google-ads.yaml` when present.

## Commands

Read-only audit:

```powershell
.\.venv\Scripts\python.exe audit_campaign.py
```

Read-only validation:

```powershell
.\.venv\Scripts\python.exe validate_campaign.py
```

Dry-run broad keyword cleanup:

```powershell
.\.venv\Scripts\python.exe pause_broad_keywords.py
```

Actually pause enabled broad-match keywords in the target campaign:

```powershell
.\.venv\Scripts\python.exe pause_broad_keywords.py --execute
```

Every command writes a timestamped local log under `logs/`. Logs are ignored because they can contain account structure and campaign data.
