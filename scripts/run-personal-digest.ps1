#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs the Personal Digest Playwright tests in Google Chrome with the account
  password entered securely at runtime.

.DESCRIPTION
  The password is read with hidden input (never echoed), injected only into the
  process environment for the test run, and scrubbed afterwards — so it is not
  written to disk and not visible in shell history.

  EMAIL must already be set in the environment (e.g. $env:EMAIL="..."), since no
  .env loader is used. The PASSWORD prompted here is set for the test process.

.PARAMETER Grep
  Optional Playwright --grep filter, e.g. -Grep "welcome landing" to run a
  single test.

.EXAMPLE
  pwsh -NoProfile -File scripts/run-personal-digest.ps1

.EXAMPLE
  npm run test:personal-digest:secure
#>
param(
  [string]$Grep
)

$ErrorActionPreference = 'Stop'

# Prompt for the password without echoing it to the terminal.
$secure = Read-Host 'Insight password' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Browser is chosen by the BROWSER env var in playwright.config.ts (default
# real Google Chrome); default it here so the secure runner uses Chrome too.
if (-not $env:BROWSER) { $env:BROWSER = 'chrome' }

$playwrightArgs = @(
  'playwright', 'test', 'personal-digest.spec.ts', '--workers=1'
)
if ($Grep) { $playwrightArgs += @('--grep', $Grep) }

try {
  npx @playwrightArgs
} finally {
  # Scrub the password from the environment once the run finishes.
  Remove-Item Env:PASSWORD -ErrorAction SilentlyContinue
}
