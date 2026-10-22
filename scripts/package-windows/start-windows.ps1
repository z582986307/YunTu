param([ValidateSet('database', 'application')][string]$Stage)
$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dbPort = if ($env:YUNTU_DB_PORT) { [int]$env:YUNTU_DB_PORT } else { 3301 }
$httpPort = if ($env:YUNTU_HTTP_PORT) { [int]$env:YUNTU_HTTP_PORT } else { 8194 }
$socketPort = if ($env:YUNTU_SOCKET_PORT) { [int]$env:YUNTU_SOCKET_PORT } else { 8195 }
$httpsPort = if ($env:YUNTU_HTTPS_PORT) { [int]$env:YUNTU_HTTPS_PORT } else { 8543 }

Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop

function Test-LocalPort([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $port); return $true }
  catch { return $false }
  finally { $client.Dispose() }
}

function Initialize-LocalTls {
  $tlsRoot = Join-Path $packageRoot 'database\tls'
  $tlsStore = Join-Path $tlsRoot 'yuntu-self-signed.p12'
  $tlsSecretFile = Join-Path $tlsRoot 'tls-secret.txt'
  [IO.Directory]::CreateDirectory($tlsRoot) | Out-Null
  if ((Test-Path -LiteralPath $tlsStore) -ne (Test-Path -LiteralPath $tlsSecretFile)) {
    throw 'HTTPS 证书或密码文件缺失，请恢复 database\tls 文件夹的完整备份。'
  }
  if (-not (Test-Path -LiteralPath $tlsStore)) {
    $random = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random)
    $tlsSecret = [Convert]::ToBase64String($random)
    $addresses = @('ip:127.0.0.1', 'dns:localhost')
    $addresses += @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { 'ip:' + $_.IPAddress })
    $env:YUNTU_TLS_SECRET = $tlsSecret
    try {
      & (Join-Path $packageRoot 'runtime\java\bin\keytool.exe') -genkeypair -alias yuntu `
        -keyalg RSA -keysize 2048 -validity 825 -dname 'CN=YunTu' `
        -keystore $tlsStore -storetype PKCS12 -storepass:env YUNTU_TLS_SECRET `
        -keypass:env YUNTU_TLS_SECRET -ext ('SAN=' + (($addresses | Select-Object -Unique) -join ',')) -noprompt 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { throw '生成本机 HTTPS 证书失败。' }
      ConvertTo-SecureString -String $tlsSecret -AsPlainText -Force |
        ConvertFrom-SecureString | Set-Content -LiteralPath $tlsSecretFile -Encoding ASCII
    } finally { Remove-Item Env:YUNTU_TLS_SECRET -ErrorAction SilentlyContinue }
  } else {
    $secure = (Get-Content -LiteralPath $tlsSecretFile -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $tlsSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
  return [pscustomobject]@{ Store = $tlsStore; Secret = $tlsSecret }
}

$port = if ($Stage -eq 'database') { $dbPort } else { $httpPort }
if (Test-LocalPort $port) {
  throw "端口 $port 已被占用。请先运行停止-Windows.bat关闭旧版云图，再重新启动。"
}
[IO.Directory]::CreateDirectory((Join-Path $packageRoot 'logs')) | Out-Null
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.WorkingDirectory = $packageRoot
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
if ($Stage -eq 'database') {
  $startInfo.FileName = Join-Path $packageRoot 'runtime\mariadb\bin\mariadbd.exe'
  $dbRoot = Join-Path $packageRoot 'runtime\mariadb'
  $dataRoot = Join-Path $packageRoot 'database\data'
  $errorLog = Join-Path $packageRoot 'logs\database.log'
  $startInfo.Arguments = '--basedir="' + $dbRoot + '" --datadir="' + $dataRoot + '" --port=' + $dbPort + ' --bind-address=127.0.0.1 --log-error="' + $errorLog + '"'
} else {
  if (-not (Test-LocalPort $dbPort)) { throw "云图数据库端口 $dbPort 未就绪，应用未启动。" }
  $secretFile = Join-Path $packageRoot 'database\db-secret.txt'
  $admin = Join-Path $packageRoot 'runtime\mariadb\bin\mariadb.exe'
  if (-not (Test-Path -LiteralPath $secretFile)) {
    $random = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random)
    $secret = [Convert]::ToBase64String($random)
    $sql = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$secret';"
    $sql | & $admin --protocol=tcp --host=127.0.0.1 --port=$dbPort --user=root
    if ($LASTEXITCODE -ne 0) { throw '数据库初次初始化失败，应用未启动。' }
    ConvertTo-SecureString -String $secret -AsPlainText -Force |
      ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding ASCII
  } else {
    $secure = (Get-Content -LiteralPath $secretFile -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
  $startInfo.FileName = Join-Path $packageRoot 'runtime\java\bin\java.exe'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.EnvironmentVariables['SPRING_DATASOURCE_PASSWORD'] = $secret
  $startInfo.EnvironmentVariables['SPRING_DATASOURCE_URL'] = "jdbc:mysql://127.0.0.1:${dbPort}/case_manager?useSSL=false&useUnicode=true&characterEncoding=utf8&serverTimezone=GMT%2B8"
  $tls = Initialize-LocalTls
  $startInfo.EnvironmentVariables['SERVER_SSL_ENABLED'] = 'true'
  $startInfo.EnvironmentVariables['SERVER_SSL_KEY_STORE'] = 'file:' + ($tls.Store -replace '\\','/')
  $startInfo.EnvironmentVariables['SERVER_SSL_KEY_STORE_TYPE'] = 'PKCS12'
  $startInfo.EnvironmentVariables['SERVER_SSL_KEY_ALIAS'] = 'yuntu'
  $startInfo.EnvironmentVariables['SERVER_SSL_KEY_STORE_PASSWORD'] = $tls.Secret
  $startInfo.EnvironmentVariables['SERVER_SSL_KEY_PASSWORD'] = $tls.Secret
  $jar = Join-Path $packageRoot 'yuntu-server.jar'
  $startInfo.Arguments = '-Xms256m -Xmx2048m -jar "' + $jar + '" --server.port=' + $httpsPort + ' --http.port=' + $httpPort + ' --socketio.port=' + $socketPort
  $secret = $null
  $tls = $null
}
$process = [System.Diagnostics.Process]::Start($startInfo)
[IO.File]::WriteAllText((Join-Path $packageRoot "logs\$Stage.pid"), [string]$process.Id)
$deadline = [DateTime]::UtcNow.AddSeconds($(if ($Stage -eq 'database') { 45 } else { 90 }))
while ([DateTime]::UtcNow -lt $deadline) {
  if ($process.HasExited) {
    throw "$Stage 进程已退出，未完成启动。请检查 logs 目录中的日志。"
  }
  if ((Test-LocalPort $port) -and ($Stage -eq 'database' -or (Test-LocalPort $httpsPort))) {
    Write-Output "$Stage 已就绪，进程编号 $($process.Id)。"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw "$Stage 启动超时。请检查 logs 目录中的日志。"
