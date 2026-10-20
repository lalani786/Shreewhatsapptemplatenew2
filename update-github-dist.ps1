# update-github-dist.ps1
# Builds the project and pushes ONLY the dist folder files to GitHub (main branch)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Update GitHub Repository (dist only)" -ForegroundColor Cyan
Write-Host "  Repo: https://github.com/lalani786/Shreewhatsapptemplatenew2.git" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

Write-Host "Step 1: Building project with Vite..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Preparing dist bundle commit..." -ForegroundColor Yellow
$gitDir = "$PSScriptRoot\.git"
$tempIndex = "$PSScriptRoot\.git\temp_dist_index"
if (Test-Path $tempIndex) { Remove-Item $tempIndex -Force }

$env:GIT_DIR = $gitDir
$env:GIT_INDEX_FILE = $tempIndex

try {
    git --work-tree="$PSScriptRoot\dist" add -A
    $tree = (git write-tree).Trim()
    $parent = (git rev-parse origin/main).Trim()
    $commit = (git commit-tree $tree -p $parent -m "build: update production build (dist)").Trim()
} finally {
    if (Test-Path $tempIndex) { Remove-Item $tempIndex -Force }
    $env:GIT_INDEX_FILE = $null
    $env:GIT_DIR = $null
}

Write-Host ""
Write-Host "Step 3: Pushing dist to GitHub main branch..." -ForegroundColor Yellow
git push origin "${commit}:refs/heads/main"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to push to GitHub" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SUCCESS: GitHub repository updated with latest dist build!" -ForegroundColor Green
Write-Host "URL: https://github.com/lalani786/Shreewhatsapptemplatenew2.git" -ForegroundColor Green
