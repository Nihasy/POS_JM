# Téléchargement des polices JIABY POS (Windows PowerShell)
# Usage: .\scripts\download-fonts.ps1

param(
    [string]$FontsDir = "public\fonts"
)

Write-Host "=== Téléchargement des polices JIABY POS ===" -ForegroundColor Green

if (-not (Test-Path $FontsDir)) {
    New-Item -ItemType Directory -Force -Path $FontsDir | Out-Null
}

$fonts = @(
    @{
        Name = "Archivo-VariableFont_wdth,wght.ttf"
        Url  = "https://github.com/Omnibus-Type/Archivo/raw/main/fonts/variable/Archivo-VariableFont_wdth,wght.ttf"
    },
    @{
        Name = "Archivo-Italic-VariableFont_wdth,wght.ttf"
        Url  = "https://github.com/Omnibus-Type/Archivo/raw/main/fonts/variable/Archivo-Italic-VariableFont_wdth,wght.ttf"
    },
    @{
        Name = "IBMPlexMono-Regular.ttf"
        Url  = "https://github.com/IBM/plex/raw/main/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf"
    },
    @{
        Name = "IBMPlexMono-Bold.ttf"
        Url  = "https://github.com/IBM/plex/raw/main/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Bold.ttf"
    }
)

$webClient = New-Object System.Net.WebClient

foreach ($font in $fonts) {
    $dest = Join-Path $FontsDir $font.Name
    Write-Host "[*] Téléchargement de $($font.Name)..." -ForegroundColor Cyan
    try {
        $webClient.DownloadFile($font.Url, $dest)
        $size = (Get-Item $dest).Length
        Write-Host "    OK: $([math]::Round($size/1KB, 1)) KB" -ForegroundColor Green
    } catch {
        Write-Host "    ÉCHEC: $_" -ForegroundColor Yellow
        Write-Host "    Téléchargez manuellement depuis: $($font.Url)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Vérification ===" -ForegroundColor Green
Get-ChildItem $FontsDir\*.ttf | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 1)
    Write-Host "  $($_.Name) ($size KB)" -ForegroundColor White
}

Write-Host ""
Write-Host "Polices dans $FontsDir\" -ForegroundColor Green
Write-Host "Si certaines polices sont manquantes, téléchargez-les depuis Google Fonts:"
Write-Host "  Archivo:  https://fonts.google.com/specimen/Archivo"
Write-Host "  IBM Plex: https://fonts.google.com/specimen/IBM+Plex+Mono"
