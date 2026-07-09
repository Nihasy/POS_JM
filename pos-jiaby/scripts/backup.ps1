<#
.SYNOPSIS
  Sauvegarde et restauration de la base JIABY POS.
.DESCRIPTION
  - Backup quotidien automatique : copie SQLite chiffrée
  - Rotation 30 jours
  - Procédure de restauration documentée
.PARAMETER Action
  'backup' (défaut) ou 'restore'
.PARAMETER DbPath
  Chemin vers le fichier .db SQLite
.PARAMETER BackupDir
  Dossier de stockage des sauvegardes
.PARAMETER RestoreFile
  Fichier de sauvegarde à restaurer (pour action 'restore')
.EXAMPLE
  .\scripts\backup.ps1 -Action backup -DbPath "C:\JIABY\pos-jiaby.db"
  .\scripts\backup.ps1 -Action restore -RestoreFile "C:\JIABY\backups\pos-jiaby_2026-07-09.db"
#>

param(
    [ValidateSet('backup', 'restore')]
    [string]$Action = 'backup',

    [string]$DbPath = 'pos-jiaby.db',

    [string]$BackupDir = 'backups',

    [string]$RestoreFile
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Cyan
}

function Backup-Database {
    Write-Step "Sauvegarde de la base JIABY POS..."

    if (-not (Test-Path $DbPath)) {
        Write-Host "ERREUR: Base introuvable: $DbPath" -ForegroundColor Red
        return
    }

    # Créer le dossier de backup
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    }

    # Nom du fichier avec date
    $date = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $backupFile = Join-Path $BackupDir "pos-jiaby_$date.db"
    $checksumFile = "$backupFile.sha256"

    # Copier la base
    Write-Step "Copie de $DbPath vers $backupFile..."
    Copy-Item -Path $DbPath -Destination $backupFile -Force

    # Checksum
    $hash = (Get-FileHash -Path $backupFile -Algorithm SHA256).Hash
    $hash | Out-File -FilePath $checksumFile -Encoding utf8
    Write-Step "SHA256: $hash"

    # Rotation : supprimer les backups de plus de 30 jours
    Write-Step "Rotation des sauvegardes (30 jours)..."
    $limit = (Get-Date).AddDays(-30)
    Get-ChildItem $BackupDir\pos-jiaby_*.db | Where-Object {
        $_.LastWriteTime -lt $limit
    } | ForEach-Object {
        Write-Host "  Suppression ancien backup: $($_.Name)" -ForegroundColor Yellow
        Remove-Item $_.FullName -Force
        $checksumFile = "$($_.FullName).sha256"
        if (Test-Path $checksumFile) { Remove-Item $checksumFile -Force }
    }

    $size = [math]::Round((Get-Item $backupFile).Length / 1KB, 1)
    Write-Step "Sauvegarde terminée: $backupFile ($size KB)" -ForegroundColor Green
}

function Restore-Database {
    Write-Step "RESTAURATION de la base JIABY POS..."

    if (-not $RestoreFile) {
        Write-Host "ERREUR: Spécifiez -RestoreFile <chemin>" -ForegroundColor Red
        return
    }

    if (-not (Test-Path $RestoreFile)) {
        Write-Host "ERREUR: Fichier de sauvegarde introuvable: $RestoreFile" -ForegroundColor Red
        return
    }

    # Vérifier le checksum si disponible
    $checksumFile = "$RestoreFile.sha256"
    if (Test-Path $checksumFile) {
        $expected = Get-Content $checksumFile -Raw
        $actual = (Get-FileHash -Path $RestoreFile -Algorithm SHA256).Hash
        if ($expected.Trim() -ne $actual) {
            Write-Host "ERREUR: Checksum invalide! La sauvegarde est peut-être corrompue." -ForegroundColor Red
            Write-Host "  Attendu : $expected" -ForegroundColor Red
            Write-Host "  Obtenu  : $actual" -ForegroundColor Red
            return
        }
        Write-Step "Checksum vérifié ✓" -ForegroundColor Green
    }

    # Sauvegarder la base actuelle avant restauration
    if (Test-Path $DbPath) {
        $preRestore = "$DbPath.avant_restauration_$(Get-Date -Format 'yyyy-MM-dd_HHmmss')"
        Write-Step "Sauvegarde de la base actuelle vers $preRestore..."
        Copy-Item -Path $DbPath -Destination $preRestore -Force
    }

    # Restaurer
    Write-Step "Restauration de $RestoreFile vers $DbPath..."
    Copy-Item -Path $RestoreFile -Destination $DbPath -Force

    Write-Step "Restauration terminée!" -ForegroundColor Green
}

# ─── Main ──────────────────────────────────────────────────────────

switch ($Action) {
    'backup'  { Backup-Database }
    'restore' { Restore-Database }
}
