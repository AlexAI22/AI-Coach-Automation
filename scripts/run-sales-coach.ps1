#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs the Sales Coach Playwright tests in Chromium with the account password
  entered securely at runtime.

.DESCRIPTION
  The password is read with hidden input (never echoed), injected only into the
  process environment for the test run, and scrubbed afterwards — so it is not
  stored in .env, not written to disk, and not visible in shell history.

  EMAIL is not secret and continues to come from .env (loaded by dotenv in
  playwright.config.ts). dotenv does not override variables already present in
  the environment, so the PASSWORD set here takes precedence.

.PARAMETER Grep
  Optional Playwright --grep filter, e.g. -Grep "welcome landing" to run a
  single test.

.EXAMPLE
  pwsh -NoProfile -File scripts/run-sales-coach.ps1

.EXAMPLE
  npm run test:sales-coach:secure
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

$playwrightArgs = @(
  'playwright', 'test', 'sales-coach.spec.ts',
  '--project=Google Chrome', '--workers=1'
)
if ($Grep) { $playwrightArgs += @('--grep', $Grep) }

try {
  npx @playwrightArgs
} finally {
  # Scrub the password from the environment once the run finishes.
  Remove-Item Env:PASSWORD -ErrorAction SilentlyContinue
}
