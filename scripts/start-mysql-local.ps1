# Arranca MySQL local (ver scripts/start-mysql.js).
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $here "start-mysql.js")
