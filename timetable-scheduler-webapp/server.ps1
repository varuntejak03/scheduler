# Native PowerShell Web Server for AuraPlan
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "AuraPlan Web Server running on http://localhost:$port/"
Write-Host "Press Ctrl+C to stop the server."

$currentDir = Get-Location

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        $urlPath = $req.Url.LocalPath
        if ($urlPath -eq "/") {
            $urlPath = "/index.html"
        }
        
        // Sanitize path and make absolute
        $relativeFile = $urlPath.Replace("/", "\").TrimStart('\')
        $filePath = Join-Path $currentDir $relativeFile
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            // Set mime types
            if ($filePath.EndsWith(".html")) { $res.ContentType = "text/html" }
            elseif ($filePath.EndsWith(".css")) { $res.ContentType = "text/css" }
            elseif ($filePath.EndsWith(".js")) { $res.ContentType = "application/javascript" }
            elseif ($filePath.EndsWith(".xlsx")) { $res.ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
            
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $res.ContentLength64 = $errorBytes.Length
            $res.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
        }
        $res.Close()
    }
} finally {
    $listener.Stop()
}
