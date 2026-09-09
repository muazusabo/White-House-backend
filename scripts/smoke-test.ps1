$ErrorActionPreference = 'Stop'
$baseUrl = if ($env:API_URL) { $env:API_URL } else { 'http://localhost:4000/api' }
$email = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { 'owner@campus-restaurant.local' }
$password = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { 'ChangeMe123!' }

function Invoke-Json($method, $path, $body, $headers = @{}) {
  return Invoke-RestMethod -Method $method -Uri "$baseUrl$path" -ContentType 'application/json' -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)
}

$health = Invoke-RestMethod -Uri "$baseUrl/health"
if ($health.status -ne 'ok') { throw 'Health check failed' }

$login = Invoke-Json 'Post' '/auth/login' @{ email = $email; password = $password }
$auth = @{ Authorization = "Bearer $($login.accessToken)" }
$categories = Invoke-RestMethod -Uri "$baseUrl/categories"
$category = $categories | Select-Object -First 1
if (-not $category) { throw 'No category available for smoke test' }

$product = Invoke-Json 'Post' '/products' @{
  name = "Smoke Test Product $(Get-Date -Format 'yyyyMMddHHmmss')"
  description = 'Disposable smoke-test product'
  price = 1
  categoryId = $category.id
} $auth

try {
  $order = Invoke-Json 'Post' '/orders' @{
    customerName = 'Smoke Test Customer'
    lodgeNumber = 'Smoke-1'
    phone = '+2348012345678'
    collectionDate = (Get-Date).ToString('yyyy-MM-dd')
    collectionTime = '12:00 PM'
    items = @(@{ productId = $product.id; quantity = 1 })
  }

  $proofPath = Join-Path $env:TEMP 'white-house-eatry-smoke-proof.pdf'
  [IO.File]::WriteAllBytes($proofPath, [Text.Encoding]::ASCII.GetBytes('%PDF-1.4 smoke proof'))
  try {
    $upload = curl.exe -sS -X POST "$baseUrl/orders/$($order.id)/payment-proof" -H "Authorization: Bearer $($login.accessToken)" -F "paymentProof=@$proofPath" | ConvertFrom-Json
    if (-not $upload.paymentProofUrl) { throw 'Payment proof was not attached' }
  } finally {
    Remove-Item $proofPath -Force -ErrorAction SilentlyContinue
  }

  $updated = Invoke-Json 'Patch' "/admin/orders/$($order.id)/status" @{ status = 'CONFIRMED' } $auth
  if ($updated.status -ne 'CONFIRMED') { throw 'Order status update failed' }
  Write-Host 'Smoke test passed: health, login, order creation, payment upload, and status update.' -ForegroundColor Green
} finally {
  try {
    Invoke-RestMethod -Method Patch -Uri "$baseUrl/products/$($product.id)/availability" -Headers $auth -ContentType 'application/json' -Body '{"available":false}' -ErrorAction Stop | Out-Null
  } catch {
    Write-Warning "Smoke-test cleanup could not disable product $($product.id): $($_.Exception.Message)"
  }
}
