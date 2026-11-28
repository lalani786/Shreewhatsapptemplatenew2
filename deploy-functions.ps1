$PROJECT_REF = "nwkhkyscsyhunjnbhmqm"
$ELEVENLABS_KEY = "sk_ff619358a482c7e62b54992aa9fc85132339641a862a6250"
$LOVABLE_API_KEY = "PASTE_YOUR_LOVABLE_API_KEY_HERE"
$PEXELS_API_KEY  = "PASTE_YOUR_PEXELS_API_KEY_HERE"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Supabase Edge Function Deployer" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1: Logging in to Supabase CLI..." -ForegroundColor Yellow
supabase login

Write-Host ""
Write-Host "Step 2: Deploying generate-video-audio..." -ForegroundColor Yellow
supabase functions deploy generate-video-audio --project-ref $PROJECT_REF --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy generate-video-audio" -ForegroundColor Red
    exit 1
}
Write-Host "OK - generate-video-audio deployed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Deploying photo-studio..." -ForegroundColor Yellow
supabase functions deploy photo-studio --project-ref $PROJECT_REF --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy photo-studio" -ForegroundColor Red
    exit 1
}
Write-Host "OK - photo-studio deployed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Deploying nvidia-access-check..." -ForegroundColor Yellow
supabase functions deploy nvidia-access-check --project-ref $PROJECT_REF --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy nvidia-access-check" -ForegroundColor Red
    exit 1
}
Write-Host "OK - nvidia-access-check deployed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Deploying nvidia-generate..." -ForegroundColor Yellow
supabase functions deploy nvidia-generate --project-ref $PROJECT_REF --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy nvidia-generate" -ForegroundColor Red
    exit 1
}
Write-Host "OK - nvidia-generate deployed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 6: Setting ElevenLabs API key as Supabase secret..." -ForegroundColor Yellow
supabase secrets set ELEVENLABS_API_KEY=$ELEVENLABS_KEY --project-ref $PROJECT_REF
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to set ELEVENLABS_API_KEY" -ForegroundColor Red; exit 1 }
Write-Host "OK - ELEVENLABS_API_KEY set" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Setting Lovable API key as Supabase secret..." -ForegroundColor Yellow
supabase secrets set LOVABLE_API_KEY=$LOVABLE_API_KEY --project-ref $PROJECT_REF
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to set LOVABLE_API_KEY" -ForegroundColor Red; exit 1 }
Write-Host "OK - LOVABLE_API_KEY set" -ForegroundColor Green

Write-Host ""
Write-Host "Step 6: Setting Pexels API key as Supabase secret..." -ForegroundColor Yellow
supabase secrets set PEXELS_API_KEY=$PEXELS_API_KEY --project-ref $PROJECT_REF
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to set PEXELS_API_KEY" -ForegroundColor Red; exit 1 }
Write-Host "OK - PEXELS_API_KEY set" -ForegroundColor Green

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  All done! All secrets are set." -ForegroundColor Green
Write-Host "  Refresh your browser to test." -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
