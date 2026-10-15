$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = Join-Path $projectRoot '运行数据\本地服务'
$databaseRoot = Join-Path $projectRoot '运行数据\本地数据库'
$javaBin = Join-Path $projectRoot '项目依赖\JDK8\jdk8u504-b01\bin\java.exe'
$databaseBin = Join-Path $projectRoot '项目依赖\MariaDB\mariadb-10.11.14-winx64\bin'
$appPidFile = Join-Path $runtimeRoot 'logs\application.pid'
$dbPidFile = Join-Path $runtimeRoot 'logs\database.pid'

if (Test-Path -LiteralPath $appPidFile) {
  $appId = [int](Get-Content -LiteralPath $appPidFile -Raw)
  $appProcess = Get-Process -Id $appId -ErrorAction SilentlyContinue
  if ($appProcess -and $appProcess.Path -ne $javaBin) { throw '进程不属于本地生产服务，拒绝停止。' }
  if ($appProcess) { Stop-Process -Id $appId -Force }
  Remove-Item -LiteralPath $appPidFile -Force
}

if (Test-Path -LiteralPath $dbPidFile) {
  $dbId = [int](Get-Content -LiteralPath $dbPidFile -Raw)
  $dbProcess = Get-Process -Id $dbId -ErrorAction SilentlyContinue
  if ($dbProcess -and $dbProcess.Path -ne (Join-Path $databaseBin 'mariadbd.exe')) {
    throw '进程不属于本地生产数据库，拒绝停止。'
  }
  if ($dbProcess) {
    $secretFile = Join-Path $databaseRoot 'db-root-secret.txt'
    if (-not (Test-Path -LiteralPath $secretFile)) { throw '缺少本地数据库管理凭据，不能安全停止数据库。' }
    $secure = (Get-Content -LiteralPath $secretFile -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:MYSQL_PWD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    try {
      & (Join-Path $databaseBin 'mariadb-admin.exe') --protocol=tcp --host=127.0.0.1 --port=3301 --user=root shutdown
      if ($LASTEXITCODE -ne 0) { throw '数据库未能安全停止，请检查日志。' }
    } finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
  }
  Remove-Item -LiteralPath $dbPidFile -Force
}
Write-Output '本地生产服务已停止。'
