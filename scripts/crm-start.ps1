<#
.SYNOPSIS
    Claude Runtime Monitor - one-click launcher
.DESCRIPTION
    Builds frontend, starts backend server, fetches DeepSeek balance,
    opens browser. Supports Ctrl+C stop.
.NOTES
    Double-click via the sibling crm-start.bat.
    Requires: Node.js >= 20, pnpm >= 8
    Compatible with Windows PowerShell 5.1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$PidFile = Join-Path $ProjectRoot ".server-pid"

# ANSI escape codes - use [char]27 for PS 5.1 compat
$ESC = [char]27
$Cyan   = "${ESC}[36m"
$Green  = "${ESC}[32m"
$Yellow = "${ESC}[33m"
$Red    = "${ESC}[31m"
$Bold   = "${ESC}[1m"
$Reset  = "${ESC}[0m"

function Write-Step($Label, $Message) {
    Write-Host "${Cyan}[${Label}]${Reset} $Message"
}

# ════ LOGO ════
Write-Host "`n${Bold}${Cyan}╔══════════════════════════════════════════╗${Reset}"
Write-Host "${Bold}${Cyan}║     Claude Runtime Monitor - one-click    ║${Reset}"
Write-Host "${Bold}${Cyan}╚══════════════════════════════════════════╝${Reset}`n"

# ════ 1. Build ════
Write-Step "1/4" "${Yellow}Building frontend...${Reset}"
try {
    pnpm run build *>&1
    Write-Host "  ${Green}OK - Build success${Reset}"
} catch {
    Write-Host "  ${Yellow}Full build failed, trying server-only...${Reset}"
    try {
        pnpm --filter @crm/server dev *>&1
    } catch {
        Write-Host "  ${Red}FAILED - Build error${Reset}"
        exit 1
    }
}

# ════ 2. Start server ════
Write-Step "2/4" "${Yellow}Starting server...${Reset}"

# Kill old process from PID file
if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -Raw | ForEach-Object { $_.Trim() }
    if ($oldPid -match '^\d+$') {
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -eq 'node') {
            $proc | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }
}

# Check port 4377
$portCheck = netstat -ano | Select-String ":4377 "
if ($portCheck) {
    $existingPid = ($portCheck -split '\s+')[-1]
    Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Start server via cmd.exe (pnpm is a .ps1 file, Start-Process can't call it directly)
$serverJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    pnpm run dev:server
} -ArgumentList $ProjectRoot

# Write a marker so we know a job is running
$serverJob.Id | Out-File -Encoding utf8 -FilePath (Join-Path $ProjectRoot ".server-job")

# Wait for ready
$maxWait = 30
$ready = $false
Write-Host "  Waiting for server to start..."
for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:4377/api/health" -Method Get -TimeoutSec 2
        $ready = $true
        break
    } catch {
        Write-Host "  ... $($i+1)s" -NoNewline
        Write-Host "`r" -NoNewline
    }
}

if (-not $ready) {
    Write-Host "`n  ${Red}FAILED - Server did not start in ${maxWait}s${Reset}"
    $serverJob | Stop-Job -PassThru | Remove-Job
    Remove-Item (Join-Path $ProjectRoot ".server-job") -Force -ErrorAction SilentlyContinue
    Write-Host "  Try running manually: cd $ProjectRoot ; pnpm run dev:server"
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    pause
    exit 1
}
Write-Host "`n  ${Green}OK - Server running at http://127.0.0.1:4377${Reset}"

# ════ 3. DeepSeek balance ════
Write-Step "3/4" "${Yellow}Fetching DeepSeek balance...${Reset}"
try {
    $quota = Invoke-RestMethod -Uri "http://127.0.0.1:4377/api/quota/deepseek" -Method Get -TimeoutSec 10
    Write-Host "  ${Green}Balance: $($quota.balance) ($($quota.status))${Reset}"
} catch {
    Write-Host "  ${Yellow}(skip - key not configured)${Reset}"
}

try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:4377/internal/sync-quota" -Method Get -TimeoutSec 5
} catch {}

# ════ 4. Open browser ════
Write-Step "4/4" "${Yellow}Opening browser...${Reset}"
try {
    Start-Process "http://127.0.0.1:4377"
    Write-Host "  ${Green}OK - Browser opened${Reset}"
} catch {
    Write-Host "  ${Yellow}(skip - could not open browser)${Reset}"
}

Write-Host "`n${Bold}${Cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Reset}"
Write-Host " ${Green}Dashboard:${Reset}   http://127.0.0.1:4377"
Write-Host " ${Green}Health:${Reset}      http://127.0.0.1:4377/api/health"
Write-Host " ${Green}Balance:${Reset}     http://127.0.0.1:4377/api/quota/deepseek"
Write-Host "${Cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Reset}`n"

Write-Host "${Yellow}Close this window or press Ctrl+C to stop${Reset}`n"

try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    # Cleanup on Ctrl+C or window close
    $jobFile = Join-Path $ProjectRoot ".server-job"
    if (Test-Path $jobFile) {
        $jobId = Get-Content $jobFile -Raw | ForEach-Object { $_.Trim() }
        if ($jobId -match '^\d+$') {
            $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
            if ($job) {
                $job | Stop-Job -PassThru | Remove-Job
            }
        }
        Remove-Item $jobFile -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $PidFile) {
        $p = Get-Content $PidFile -Raw | ForEach-Object { $_.Trim() }
        if ($p) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "`nServer stopped."
}
