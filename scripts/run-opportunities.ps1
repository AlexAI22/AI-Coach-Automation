#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs the Opportunities Coach Me specs, which are skipped unless RUN_OPPORTUNITIES is set.

.PARAMETER Suite
  prompts (default, fast) | answers (8 real AI runs, 20+ min) | all.

.EXAMPLE
  npm run test:opportunities:answers -- -Headed
#>
param(
  [ValidateSet('prompts', 'answers', 'all')]
  [string]$Suite = 'prompts',
  [switch]$Headed
)

$specs = switch ($Suite) {
  'prompts' { @('tests/coachMeOpportunities.spec.ts') }
  'answers' { @('tests/coachMeOpportunitiesAnswers.spec.ts') }
  'all' { @('tests/coachMeOpportunities.spec.ts', 'tests/coachMeOpportunitiesAnswers.spec.ts') }
}

$playwrightArgs = @('playwright', 'test') + $specs
if ($Headed) { $playwrightArgs += '--headed' }

$env:RUN_OPPORTUNITIES = '1'
try {
  npx @playwrightArgs
} finally {
  Remove-Item Env:RUN_OPPORTUNITIES -ErrorAction SilentlyContinue
}
exit $LASTEXITCODE
