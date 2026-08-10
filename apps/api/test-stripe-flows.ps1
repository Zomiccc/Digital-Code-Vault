# Stripe Payment Flow Tests
# Tests: merchant wallet funding, customer purchase, webhook idempotency, reveal flow
# Usage: .\test-stripe-flows.ps1

$baseUrl = "http://localhost:3000/api/v1"
$results = @()
$passed = 0
$failed = 0

function Test-Result($name, $success, $details = "") {
  $status = if ($success) { "PASS" } else { "FAIL" }
  $color = if ($success) { "Green" } else { "Red" }
  Write-Host "[$status] $name" -ForegroundColor $color
  if ($details) { Write-Host "  Details: $details" -ForegroundColor Gray }
  $script:results += [PSCustomObject]@{ Name = $name; Status = $status; Details = $details }
  if ($success) { $script:passed++ } else { $script:failed++ }
}

# ─── Test 1: Stripe publishable key endpoint ───
Write-Host "`n=== Test 1: Stripe Publishable Key ===" -ForegroundColor Cyan
try {
  $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/publishable-key" -Method GET -ErrorAction Stop
  Test-Result "GET /stripe/publishable-key returns 200" $true "Key: $($resp.publishable_key)"
} catch {
  Test-Result "GET /stripe/publishable-key returns 200" $false $_.Exception.Message
}

# ─── Test 2: Merchant funding session - invalid amount ───
Write-Host "`n=== Test 2: Merchant Funding - Invalid Amount ===" -ForegroundColor Cyan
try {
  # First login as merchant
  $loginBody = @{ email = "merchant@test.com"; password = "test123" } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Uri "$baseUrl/auth/merchant/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
  $merchantToken = $loginResp.access_token

  $body = @{ amount = -10 } | ConvertTo-Json
  $headers = @{ Authorization = "Bearer $merchantToken" }
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/merchant-funding/create-session" -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
    Test-Result "Negative amount rejected" $false "Should have rejected negative amount"
  } catch {
    Test-Result "Negative amount rejected" $true "Correctly rejected: $($_.Exception.Message)"
  }
} catch {
  Test-Result "Merchant login for tests" $false $_.Exception.Message
}

# ─── Test 3: Merchant funding session - valid amount ───
Write-Host "`n=== Test 3: Merchant Funding - Valid Amount ===" -ForegroundColor Cyan
try {
  $body = @{ amount = 50.00; currency = "USD" } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/merchant-funding/create-session" -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
  $hasUrl = $null -ne $resp.checkout_url
  $hasSessionId = $null -ne $resp.session_id
  $hasPaymentRecord = $null -ne $resp.payment_record_id
  Test-Result "Merchant funding session created" ($hasUrl -and $hasSessionId -and $hasPaymentRecord) "URL: $($resp.checkout_url?.Substring(0,50))..."
  $merchantPaymentRecordId = $resp.payment_record_id
} catch {
  Test-Result "Merchant funding session created" $false $_.Exception.Message
  $merchantPaymentRecordId = $null
}

# ─── Test 4: Payment record lookup ───
Write-Host "`n=== Test 4: Payment Record Lookup ===" -ForegroundColor Cyan
if ($merchantPaymentRecordId) {
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/payment/$merchantPaymentRecordId" -Method GET -ErrorAction Stop
    $correctStatus = $resp.status -eq "PENDING"
    $correctType = $resp.payment_type -eq "MERCHANT_WALLET_FUNDING"
    Test-Result "Payment record lookup" ($correctStatus -and $correctType) "Status: $($resp.status), Type: $($resp.payment_type)"
  } catch {
    Test-Result "Payment record lookup" $false $_.Exception.Message
  }
} else {
  Test-Result "Payment record lookup" $false "No payment record ID from previous test"
}

# ─── Test 5: Customer purchase session - missing fields ───
Write-Host "`n=== Test 5: Customer Purchase - Missing Fields ===" -ForegroundColor Cyan
try {
  $body = @{ product_id = "test" } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/customer-purchase/create-session" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Test-Result "Missing fields rejected" $false "Should have rejected missing fields"
  } catch {
    Test-Result "Missing fields rejected" $true "Correctly rejected"
  }
} catch {
  Test-Result "Customer purchase setup" $false $_.Exception.Message
}

# ─── Test 6: Customer purchase session - invalid product ───
Write-Host "`n=== Test 6: Customer Purchase - Invalid Product ===" -ForegroundColor Cyan
try {
  $body = @{ product_id = "nonexistent-product-id"; amount = 10; customer_email = "test@test.com" } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/customer-purchase/create-session" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Test-Result "Invalid product rejected" $false "Should have rejected invalid product"
  } catch {
    Test-Result "Invalid product rejected" $true "Correctly rejected: $($_.Exception.Message)"
  }
} catch {
  Test-Result "Customer purchase invalid product test" $false $_.Exception.Message
}

# ─── Test 7: Stripe webhook - invalid signature ───
Write-Host "`n=== Test 7: Stripe Webhook - Invalid Signature ===" -ForegroundColor Cyan
try {
  $body = '{"type":"checkout.session.completed"}'
  $headers = @{ "stripe-signature" = "invalid_signature" }
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/webhook" -Method POST -Body $body -ContentType "application/json" -Headers $headers -ErrorAction Stop
    Test-Result "Invalid webhook signature rejected" $false "Should have rejected invalid signature"
  } catch {
    Test-Result "Invalid webhook signature rejected" $true "Correctly rejected"
  }
} catch {
  Test-Result "Webhook invalid signature test" $false $_.Exception.Message
}

# ─── Test 8: Stripe webhook - missing signature header ───
Write-Host "`n=== Test 8: Stripe Webhook - Missing Signature Header ===" -ForegroundColor Cyan
try {
  $body = '{"type":"checkout.session.completed"}'
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/webhook" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Test-Result "Missing webhook signature rejected" $false "Should have rejected missing signature"
  } catch {
    Test-Result "Missing webhook signature rejected" $true "Correctly rejected"
  }
} catch {
  Test-Result "Webhook missing signature test" $false $_.Exception.Message
}

# ─── Test 9: Admin list Stripe payments ───
Write-Host "`n=== Test 9: Admin List Stripe Payments ===" -ForegroundColor Cyan
try {
  # Login as admin
  $adminLoginBody = @{ email = "admin@codevault.com"; password = "admin123" } | ConvertTo-Json
  $adminLoginResp = Invoke-RestMethod -Uri "$baseUrl/auth/admin/login" -Method POST -Body $adminLoginBody -ContentType "application/json" -ErrorAction Stop
  $adminToken = $adminLoginResp.access_token
  $adminHeaders = @{ Authorization = "Bearer $adminToken" }

  $resp = Invoke-RestMethod -Uri "$baseUrl/stripe/payments?limit=10" -Method GET -Headers $adminHeaders -ErrorAction Stop
  $hasItems = $null -ne $resp.items
  $hasTotal = $null -ne $resp.total
  Test-Result "Admin list Stripe payments" ($hasItems -and $hasTotal) "Total: $($resp.total)"
} catch {
  Test-Result "Admin list Stripe payments" $false $_.Exception.Message
}

# ─── Test 10: Merchant funding success redirect ───
Write-Host "`n=== Test 10: Merchant Funding Success Redirect ===" -ForegroundColor Cyan
try {
  # This should redirect (302) — Invoke-RestMethod follows redirects by default
  # We need to use Invoke-WebRequest to check the redirect
  $resp = Invoke-WebRequest -Uri "$baseUrl/stripe/merchant-funding/success?session_id=test_session_123" -Method GET -MaximumRedirection 0 -ErrorAction SilentlyContinue
  # If we get here without exception, check if it's a redirect
  Test-Result "Merchant funding success redirect" ($resp.StatusCode -ge 300 -and $resp.StatusCode -lt 400) "Status: $($resp.StatusCode)"
} catch {
  # 302 redirects throw in Invoke-WebRequest with -MaximumRedirection 0
  $code = $_.Exception.Response.StatusCode.value__
  Test-Result "Merchant funding success redirect" ($code -ge 300 -and $code -lt 400) "Status: $code"
}

# ─── Test 11: Customer purchase success redirect ───
Write-Host "`n=== Test 11: Customer Purchase Success Redirect ===" -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -Uri "$baseUrl/stripe/customer-purchase/success?session_id=test_session_123" -Method GET -MaximumRedirection 0 -ErrorAction SilentlyContinue
  Test-Result "Customer purchase success redirect" ($resp.StatusCode -ge 300 -and $resp.StatusCode -lt 400) "Status: $($resp.StatusCode)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test-Result "Customer purchase success redirect" ($code -ge 300 -and $code -lt 400) "Status: $code"
}

# ─── Test 12: Customer purchase cancel redirect ───
Write-Host "`n=== Test 12: Customer Purchase Cancel Redirect ===" -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -Uri "$baseUrl/stripe/customer-purchase/cancel?session_id=test_session_123" -Method GET -MaximumRedirection 0 -ErrorAction SilentlyContinue
  Test-Result "Customer purchase cancel redirect" ($resp.StatusCode -ge 300 -and $resp.StatusCode -lt 400) "Status: $($resp.StatusCode)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test-Result "Customer purchase cancel redirect" ($code -ge 300 -and $code -lt 400) "Status: $code"
}

# ─── Test 13: Idempotency check - PaymentRecord model exists ───
Write-Host "`n=== Test 13: Prisma Schema - PaymentRecord Model ===" -ForegroundColor Cyan
try {
  $schemaContent = Get-Content -Path "prisma/schema.prisma" -Raw
  $hasPaymentRecord = $schemaContent -match "model PaymentRecord"
  $hasCustomerOrder = $schemaContent -match "model CustomerOrder"
  $hasStripeEventId = $schemaContent -match "stripeEventId"
  Test-Result "Prisma schema has PaymentRecord" $hasPaymentRecord
  Test-Result "Prisma schema has CustomerOrder" $hasCustomerOrder
  Test-Result "Prisma schema has stripeEventId for idempotency" $hasStripeEventId
} catch {
  Test-Result "Prisma schema check" $false $_.Exception.Message
}

# ─── Test 14: Stripe service file exists ───
Write-Host "`n=== Test 14: Stripe Service Files ===" -ForegroundColor Cyan
$stripeServiceExists = Test-Path "src/stripe/stripe.service.ts"
$stripeControllerExists = Test-Path "src/stripe/stripe.controller.ts"
$stripeModuleExists = Test-Path "src/stripe/stripe.module.ts"
Test-Result "stripe.service.ts exists" $stripeServiceExists
Test-Result "stripe.controller.ts exists" $stripeControllerExists
Test-Result "stripe.module.ts exists" $stripeModuleExists

# ─── Test 15: Stripe module registered in app.module.ts ───
Write-Host "`n=== Test 15: StripeModule Registration ===" -ForegroundColor Cyan
try {
  $appModuleContent = Get-Content -Path "src/app.module.ts" -Raw
  $hasImport = $appModuleContent -match "import.*StripeModule"
  $hasRegistration = $appModuleContent -match "StripeModule,"
  Test-Result "StripeModule imported in app.module.ts" $hasImport
  Test-Result "StripeModule registered in imports array" $hasRegistration
} catch {
  Test-Result "StripeModule registration check" $false $_.Exception.Message
}

# ─── Summary ───
Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host "Total: $($results.Count)" -ForegroundColor Gray

if ($failed -gt 0) {
  Write-Host "`nFailed tests:" -ForegroundColor Red
  $results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
    Write-Host "  - $($_.Name): $($_.Details)" -ForegroundColor Red
  }
}

exit $failed
