#Requires -Version 5.1
<#
.SYNOPSIS
    Deploys EsquerrApp Firestore/Storage rules and/or Cloud Functions from Windows.

.DESCRIPTION
    The Windows-native counterpart to deploy.sh, which is written for Cloud Shell
    and cannot run in PowerShell. Same guards, three deliberate differences:

      * NO `git pull`. deploy.sh pulls because Cloud Shell holds a throwaway
        clone that is usually behind. This machine holds the working tree you
        are editing, and pulling mid-change is the wrong default.

      * FUNCTIONS_DISCOVERY_TIMEOUT is raised. To decide what to deploy, the CLI
        spawns functions/index.js and reads its exports, with a 10s budget. The
        module itself loads in ~0.5s warm, but a COLD node_modules on Windows
        (antivirus scanning thousands of files) blows through 10s and fails with
        "Cannot determine backend specification. Timeout after 10000". Nothing
        is wrong with the code when that happens — retrying usually works, and
        this makes the retry unnecessary.

      * -DryRun validates without releasing. Use it before anything you have
        not deployed from this machine before.

    Why a guard script at all: the Firebase CLI's remembered active project can
    override .firebaserc, and doing exactly that once wiped a DIFFERENT
    project's rules. Every deploy here passes --project explicitly. There are
    now two Firebase projects and two accounts on this machine, so read the
    "=== Deploying to 'esquerrapp'..." header before confirming anything.

.PARAMETER Target
    rules     — firestore rules + storage rules
    functions — cloud functions
    all       — both

.PARAMETER DryRun
    Validate and package without releasing.

.PARAMETER Install
    Run `npm install` in functions/ first. deploy.sh always does this because
    Cloud Shell is ephemeral; here node_modules persists, so it is opt-in.

.EXAMPLE
    .\deploy.ps1 rules -DryRun
.EXAMPLE
    .\deploy.ps1 functions
.EXAMPLE
    .\deploy.ps1 all
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('rules', 'functions', 'all')]
    [string]$Target = 'rules',

    [switch]$DryRun,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

$EXPECTED_REPO = 'ScaredMeeseks/EsquerrApp'
$PROJECT       = 'esquerrapp'

# Operate on the script's own directory, never the caller's. A deploy run from
# the wrong folder is the failure mode this whole script exists to prevent.
Set-Location $PSScriptRoot

# ── 1. Right repo? ───────────────────────────────────────────
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0) {
    Write-Host "X  Not a git repository (or no 'origin' remote): $PSScriptRoot" -ForegroundColor Red
    exit 1
}
if ($remote -notlike "*$EXPECTED_REPO*") {
    Write-Host "X  Wrong repo: origin is '$remote' (expected $EXPECTED_REPO)." -ForegroundColor Red
    exit 1
}
Write-Host "OK Repo: $remote" -ForegroundColor Green

# ── 2. .firebaserc sanity ────────────────────────────────────
if (-not (Test-Path '.firebaserc')) {
    Write-Host "X  .firebaserc is missing." -ForegroundColor Red
    exit 1
}
if ((Get-Content '.firebaserc' -Raw) -notmatch [regex]::Escape($PROJECT)) {
    Write-Host "X  .firebaserc does not point to $PROJECT." -ForegroundColor Red
    exit 1
}
Write-Host "OK .firebaserc -> $PROJECT" -ForegroundColor Green

# ── 3. Which account? ────────────────────────────────────────
# Two accounts live on this machine: administracion@mov-ment.com owns the
# Movment project and CANNOT see esquerrapp. `firebase login:use <email>` binds
# an account per directory; this just surfaces which one is about to be used.
$who = (firebase login:list | Select-Object -First 1)
Write-Host "OK $who" -ForegroundColor Green

# ── 4. Optional npm install ──────────────────────────────────
if ($Install -and $Target -ne 'rules') {
    Write-Host "-> npm install in functions/ ..." -ForegroundColor Cyan
    Push-Location 'functions'
    npm install
    $npmExit = $LASTEXITCODE
    Pop-Location
    if ($npmExit -ne 0) {
        Write-Host "X  npm install failed." -ForegroundColor Red
        exit 1
    }
}

# ── 5. Deploy ────────────────────────────────────────────────
$onlyFor = @{
    'rules'     = 'firestore:rules,storage'
    'functions' = 'functions'
    'all'       = 'firestore:rules,storage,functions'
}
$only = $onlyFor[$Target]

# See the header comment: this is the cold-node_modules mitigation, not a
# workaround for slow initialization in our own code.
$env:FUNCTIONS_DISCOVERY_TIMEOUT = 120

$fbArgs = @('deploy', '--only', $only, '--project', $PROJECT)
if ($DryRun) { $fbArgs += '--dry-run' }

Write-Host ''
Write-Host "-> firebase $($fbArgs -join ' ')" -ForegroundColor Cyan
Write-Host "   Read the '=== Deploying to $PROJECT...' header before confirming." -ForegroundColor Yellow
Write-Host ''

& firebase @fbArgs
$deployExit = $LASTEXITCODE

if ($deployExit -ne 0) {
    Write-Host ''
    Write-Host "X  Deploy failed (exit $deployExit)." -ForegroundColor Red
    Write-Host "   'Cannot determine backend specification. Timeout after 10000'" -ForegroundColor Yellow
    Write-Host "   means a COLD node_modules, not broken code. Just run it again." -ForegroundColor Yellow
    exit $deployExit
}

Write-Host ''
if ($DryRun) {
    Write-Host "OK Dry run complete - nothing was released." -ForegroundColor Green
} else {
    Write-Host "OK Deployed '$Target' to $PROJECT." -ForegroundColor Green
}
