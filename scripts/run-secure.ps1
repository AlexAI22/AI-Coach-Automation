#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs Playwright tests with the account password entered at a hidden prompt.

.DESCRIPTION
  The password is read with masked input (never echoed), injected only into the
  process environment for the run, and scrubbed afterwards — so it is not written
  to disk and not visible in shell history. EMAIL is prompted only if it is not
  already set in the environment.

.PARAMETER Spec
  Optional spec file to run (e.g. personal-digest.spec.ts). Omit to run all.

.PARAMETER Browser
  chrome (default) | chromium | edge | firefox | webkit.

.PARAMETER Headed
  Show a visible browser window.

.PARAMETER Grep
  Optional Playwright --grep filter.

.EXAMPLE
  npm run test:secure -- -Spec personal-digest.spec.ts -Headed

.EXAMPLE
  pwsh -NoProfile -File scripts/run-secure.ps1 -Spec sales-coach.spec.ts
#>
param(
  [string]$Spec = '',
  [string]$Browser = 'chrome',
  [switch]$Headed,
  [string]$Grep
)

$ErrorActionPreference = 'Stop'

# Load credentials from a git-ignored local file if present, so the password is
# never typed on the command line or echoed. Format (credentials.local.json):
#   { "email": "you@insight.com", "password": "secret" }
$credFile = Join-Path $PSScriptRoot '..\credentials.local.json'
if (Test-Path $credFile) {
  $creds = Get-Content $credFile -Raw | ConvertFrom-Json
  if ($creds.email) { $env:EMAIL = $creds.email }
  if ($creds.password) { $env:PASSWORD = $creds.password }
}

# EMAIL is not secret; prompt only if still missing.
if (-not $env:EMAIL) { $env:EMAIL = Read-Host 'Insight email' }

# Prompt for the password (masked) only if it wasn't loaded from the file/env.
if (-not $env:PASSWORD) {
  $secure = Read-Host 'Insight password' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $env:PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:BROWSER = $Browser

$playwrightArgs = @('playwright', 'test', '--workers=1')
if ($Spec) { $playwrightArgs = @('playwright', 'test', $Spec, '--workers=1') }
if ($Headed) { $playwrightArgs += '--headed' }
if ($Grep) { $playwrightArgs += @('--grep', $Grep) }

try {
  npx @playwrightArgs
} finally {
  # Scrub the password from the environment once the run finishes.
  Remove-Item Env:PASSWORD -ErrorAction SilentlyContinue
}
