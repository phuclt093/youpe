<#
  Tao cac shortcut youpe ngoai Desktop.

  Chay: chuot phai -> Run with PowerShell
  Hoac bam dup file create-shortcut.bat ben canh.
#>

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$web     = Join-Path $root 'youpe-web'
$icon    = Join-Path $web  'assets\youpe.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$start   = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\youpe'

New-Item -ItemType Directory -Force -Path $start | Out-Null
$shell = New-Object -ComObject WScript.Shell

function New-YoupeShortcut {
  param($Name, $Target, $Description, $Minimized = $true, $DesktopToo = $true)

  if (-not (Test-Path $Target)) {
    Write-Host "  [bo qua] khong thay $Target" -ForegroundColor DarkYellow
    return
  }

  $paths = @(Join-Path $start "$Name.lnk")
  if ($DesktopToo) { $paths += Join-Path $desktop "$Name.lnk" }

  foreach ($p in $paths) {
    $sc = $shell.CreateShortcut($p)
    $sc.TargetPath       = $Target
    $sc.WorkingDirectory = Split-Path -Parent $Target
    $sc.Description      = $Description
    $sc.WindowStyle      = if ($Minimized) { 7 } else { 1 }
    if (Test-Path $icon) { $sc.IconLocation = $icon }
    $sc.Save()
  }

  Write-Host "  [OK] $Name" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Dang tao shortcut..." -ForegroundColor Cyan
Write-Host ""

# --- chay hang ngay ---
New-YoupeShortcut -Name 'youpe' `
  -Target (Join-Path $web 'start-youpe.bat') `
  -Description 'Xem video khong quang cao'

New-YoupeShortcut -Name 'youpe (cho TV box)' `
  -Target (Join-Path $web 'start-youpe-lan.bat') `
  -Description 'Chay server cho ca thiet bi khac trong nha'

# --- build: de cua so hien ra vi can theo doi tien trinh ---
New-YoupeShortcut -Name 'youpe - Build app desktop' `
  -Target (Join-Path $root 'BUILD-DESKTOP.bat') `
  -Description 'Dong goi thanh file cai dat Windows' `
  -Minimized $false -DesktopToo $false

New-YoupeShortcut -Name 'youpe - Build ban web' `
  -Target (Join-Path $root 'BUILD-WEB.bat') `
  -Description 'Build lai ban web sau khi sua code' `
  -Minimized $false -DesktopToo $false

Write-Host ""
Write-Host "  Xong." -ForegroundColor Cyan
Write-Host "    Desktop     : youpe, youpe (cho TV box)" -ForegroundColor DarkGray
Write-Host "    Start Menu  : them 2 shortcut build" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Bam Enter de dong"
