# Stewardly — simple static file server
$logFile = Join-Path $PSScriptRoot "serve.log"
function Log($msg) { $ts = Get-Date -Format "HH:mm:ss"; "$ts $msg" | Tee-Object -FilePath $logFile -Append | Write-Host }

Log "Script started. PSScriptRoot=$PSScriptRoot"
Log "PORT env: '$env:PORT'"

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Log "Serving '$root' on port $port"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".json" = "application/json"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff2"= "font/woff2"
}

try {
  $http = New-Object System.Net.HttpListener
  $http.Prefixes.Add("http://localhost:$port/")
  $http.Start()
  Log "HttpListener started on http://localhost:$port"
} catch {
  Log "FATAL: Failed to start HttpListener: $_"
  exit 1
}

while ($http.IsListening) {
  try {
    $ctx  = $http.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }

    $file = Join-Path $root $path
    if (-not (Test-Path $file -PathType Leaf)) {
      $file = Join-Path $root "index.html"
    }

    $ext  = [System.IO.Path]::GetExtension($file).ToLower()
    $type = if ($mime[$ext]) { $mime[$ext] } else { "application/octet-stream" }
    $body = [System.IO.File]::ReadAllBytes($file)
    $ctx.Response.StatusCode      = 200
    $ctx.Response.ContentType     = $type
    $ctx.Response.ContentLength64 = $body.Length
    $ctx.Response.OutputStream.Write($body, 0, $body.Length)
  } catch { Log "Request error: $_" }
  finally { try { $ctx.Response.Close() } catch { } }
}
Log "HttpListener stopped."
