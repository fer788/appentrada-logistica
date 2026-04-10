$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $projectRoot "docs\INFRA-SISTEMAS.html"
$pdfPath = Join-Path $projectRoot "docs\INFRA-SISTEMAS.pdf"

if (-not (Test-Path $htmlPath)) {
  Write-Error "No existe: $htmlPath"
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) {
  Write-Error "No se encontró Microsoft Edge para generar el PDF. Abrí docs/INFRA-SISTEMAS.html y usá Imprimir → Guardar como PDF."
}

$fileUrl = [System.Uri]::new((Resolve-Path $htmlPath).Path).AbsoluteUri

if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force }

& $edge --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$pdfPath" $fileUrl

$deadline = (Get-Date).AddSeconds(15)
while (-not (Test-Path $pdfPath) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 200
}

if (-not (Test-Path $pdfPath)) {
  Write-Error "No se generó el PDF. Abrí docs/INFRA-SISTEMAS.html en el navegador e imprimí a PDF."
}

Write-Host "PDF generado:"
Write-Host $pdfPath
