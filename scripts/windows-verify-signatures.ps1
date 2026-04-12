param(
  [Parameter(Mandatory = $false)]
  [string]$Dir = "release-files",

  [Parameter(Mandatory = $false)]
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Dir)) {
  throw "Directory not found: $Dir"
}

$resolvedDir = (Resolve-Path -LiteralPath $Dir).Path
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $resolvedDir "windows-signing-report.json"
}

$files = Get-ChildItem -Path $resolvedDir -File | Where-Object {
  $_.Extension -ieq ".exe" -or $_.Extension -ieq ".msi"
}

if ($files.Count -eq 0) {
  throw "No .exe or .msi artifacts found in $resolvedDir"
}

$reportEntries = @()

foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -FilePath $file.FullName
  $status = [string]$signature.Status
  $signer = ""
  $thumbprint = ""

  if ($null -ne $signature.SignerCertificate) {
    $signer = [string]$signature.SignerCertificate.Subject
    $thumbprint = [string]$signature.SignerCertificate.Thumbprint
  }

  if ($status -ne "Valid") {
    throw "Invalid Authenticode signature for $($file.FullName): $status"
  }

  $reportEntries += [PSCustomObject]@{
    file = $file.Name
    path = $file.FullName
    status = $status
    signer = $signer
    thumbprint = $thumbprint
  }
}

$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  directory = $resolvedDir
  passed = $true
  files = $reportEntries
}

$reportJson = $report | ConvertTo-Json -Depth 8
$reportJson | Out-File -FilePath $ReportPath -Encoding UTF8 -Force

Write-Host "Windows signature verification passed: $ReportPath"
