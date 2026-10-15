$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = Join-Path $projectRoot '运行数据\本地服务'
$databaseRoot = Join-Path $projectRoot '运行数据\本地数据库'
$databaseData = Join-Path $databaseRoot 'data'
$databaseBin = Join-Path $projectRoot '项目依赖\MariaDB\mariadb-10.11.14-winx64\bin'
$javaBin = Join-Path $projectRoot '项目依赖\JDK8\jdk8u504-b01\bin\java.exe'
$jar = Join-Path $runtimeRoot 'yuntu-server.jar'
$dbPort = 3301
$httpPort = 8194

foreach ($required in @($databaseData, (Join-Path $databaseRoot 'app-secret.txt'), $javaBin, $jar)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "本地生产服务缺少文件：$required" }
}
New-Item -ItemType Directory -Path (Join-Path $runtimeRoot 'logs') -Force | Out-Null

function Test-LocalPort([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $port); return $true }
  catch { return $false }
  finally { $client.Dispose() }
}

$dbPidFile = Join-Path $runtimeRoot 'logs\database.pid'
$appPidFile = Join-Path $runtimeRoot 'logs\application.pid'
if (Test-LocalPort $dbPort) {
  if (-not (Test-Path -LiteralPath $dbPidFile)) { throw '3301 端口已被其他数据库占用。' }
  $dbId = [int](Get-Content -LiteralPath $dbPidFile -Raw)
  $dbProcess = Get-Process -Id $dbId -ErrorAction SilentlyContinue
  if (-not $dbProcess -or $dbProcess.Path -ne (Join-Path $databaseBin 'mariadbd.exe')) {
    throw '3301 端口不是本地生产数据库，已停止启动以保护数据。'
  }
} else {
  $dbInfo = New-Object System.Diagnostics.ProcessStartInfo
  $dbInfo.FileName = Join-Path $databaseBin 'mariadbd.exe'
  $dbInfo.WorkingDirectory = $projectRoot
  $dbInfo.UseShellExecute = $false
  $dbInfo.CreateNoWindow = $true
  $dbInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $dbInfo.Arguments = '--basedir="' + (Split-Path $databaseBin -Parent) + '" --datadir="' + $databaseData + '" --port=' + $dbPort + ' --bind-address=127.0.0.1 --log-error="' + (Join-Path $runtimeRoot 'logs\database.log') + '"'
  $dbProcess = [System.Diagnostics.Process]::Start($dbInfo)
  [System.IO.File]::WriteAllText($dbPidFile, [string]$dbProcess.Id)
  for ($attempt = 0; $attempt -lt 60 -and -not (Test-LocalPort $dbPort); $attempt++) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-LocalPort $dbPort)) { throw '本地数据库启动超时，请检查运行数据\本地服务\logs\database.log。' }
}

if (Test-LocalPort $httpPort) {
  if (-not (Test-Path -LiteralPath $appPidFile)) { throw '8194 端口已被其他服务占用。' }
  $appId = [int](Get-Content -LiteralPath $appPidFile -Raw)
  $appProcess = Get-Process -Id $appId -ErrorAction SilentlyContinue
  if (-not $appProcess -or $appProcess.Path -ne $javaBin) { throw '8194 端口不是本地生产服务。' }
  Write-Output '本地生产服务已在运行。'
  exit 0
}

$secure = (Get-Content -LiteralPath (Join-Path $databaseRoot 'app-secret.txt') -Raw).Trim() | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$appInfo = New-Object System.Diagnostics.ProcessStartInfo
$appInfo.FileName = $javaBin
$appInfo.WorkingDirectory = $runtimeRoot
$appInfo.UseShellExecute = $false
$appInfo.CreateNoWindow = $true
$appInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$appInfo.EnvironmentVariables['SPRING_DATASOURCE_USERNAME'] = 'yuntu_app'
$appInfo.EnvironmentVariables['SPRING_DATASOURCE_PASSWORD'] = $secret
$appInfo.EnvironmentVariables['SPRING_DATASOURCE_URL'] = "jdbc:mysql://127.0.0.1:${dbPort}/case_manager?useSSL=false&useUnicode=true&characterEncoding=utf8&serverTimezone=GMT%2B8"
$appInfo.Arguments = '-Xms256m -Xmx2048m -jar "' + $jar + '" --server.port=8543 --http.port=' + $httpPort + ' --socketio.port=8195'
$appProcess = [System.Diagnostics.Process]::Start($appInfo)
$secret = $null
[System.IO.File]::WriteAllText($appPidFile, [string]$appProcess.Id)
for ($attempt = 0; $attempt -lt 90 -and -not (Test-LocalPort $httpPort); $attempt++) { Start-Sleep -Seconds 1 }
if (-not (Test-LocalPort $httpPort)) { throw '本地服务启动超时，请检查运行数据\本地服务\logs。' }
Write-Output '本地生产服务已启动。'
