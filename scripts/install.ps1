#!/usr/bin/env pwsh
param(
  [String]$Version = "latest",
  [Switch]$NoPathUpdate = $false
)

$ErrorActionPreference = "Stop"

$Arch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PROCESSOR_ARCHITECTURE
if ($Arch -ne "AMD64") {
  Write-Output "Install Failed: oph only supports x64 Windows."
  exit 1
}

$GH_REPO = "BuildmodeOne/oph-cli"
$BinName = "oph-win32-x64.exe"
$InstallDir = "$Home\.oph\bin"
$ExePath = "$InstallDir\oph.exe"

$BaseURL = "https://github.com/$GH_REPO/releases"
$URL = if ($Version -eq "latest") {
  "$BaseURL/latest/download/$BinName"
} else {
  $Tag = if ($Version -match "^v") { $Version } else { "v$Version" }
  "$BaseURL/download/$Tag/$BinName"
}

$null = New-Item -ItemType Directory -Force -Path $InstallDir

Write-Output "Downloading oph from $URL..."

try {
  curl.exe "-#SfLo" "$ExePath" "$URL"
  if ($LASTEXITCODE -ne 0) { throw "curl exited with $LASTEXITCODE" }
} catch {
  Write-Warning "curl.exe failed, falling back to Invoke-RestMethod..."
  Invoke-RestMethod -Uri $URL -OutFile $ExePath
}

if (!(Test-Path $ExePath)) {
  Write-Output "Install Failed: binary not found at $ExePath"
  exit 1
}

$Version = & "$ExePath" --version 2>&1
Write-Output "oph $Version installed to $ExePath"

# PATH helpers — write directly to registry to avoid variable expansion issues
function Publish-Env {
  if (-not ("Win32.NativeMethods" -as [Type])) {
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
    uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
  }
  $result = [UIntPtr]::Zero
  [Win32.NativeMethods]::SendMessageTimeout(
    [IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$result
  ) | Out-Null
}

function Get-UserPath {
  $key = (Get-Item 'HKCU:').OpenSubKey('Environment')
  $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}

function Set-UserPath([String]$Value) {
  $key = (Get-Item 'HKCU:').OpenSubKey('Environment', $true)
  $kind = if ($Value.Contains('%')) {
    [Microsoft.Win32.RegistryValueKind]::ExpandString
  } else {
    [Microsoft.Win32.RegistryValueKind]::String
  }
  $key.SetValue('Path', $Value, $kind)
  Publish-Env
}

if (-not $NoPathUpdate) {
  $CurrentPath = (Get-UserPath) -split ';' | Where-Object { $_ -ne '' }
  if ($CurrentPath -notcontains $InstallDir) {
    $NewPath = ($CurrentPath + $InstallDir) -join ';'
    Set-UserPath $NewPath
    $env:PATH = "$env:PATH;$InstallDir"
    Write-Output "Added $InstallDir to your PATH."
  }
}

Write-Output ""
Write-Output "Restart your terminal, then run: oph --help"
