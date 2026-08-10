$ErrorActionPreference = 'Stop'

# Admin login
$adminBody = @{
    email = 'admin@digitalcode.local'
    password = 'ac35b19310c53df035b617ecfb6a9c2d'
} | ConvertTo-Json
$admin = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/admin/login' -Method POST -Body $adminBody -ContentType 'application/json' -TimeoutSec 10
$atoken = $admin.access_token

# Merchant login
$mbody = @{
    email = 'merchant@test.com'
    password = 'Merchant123!@#'
} | ConvertTo-Json
$mres = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/merchant/login' -Method POST -Body $mbody -ContentType 'application/json' -TimeoutSec 10
$mtoken = $mres.access_token
$merchantId = $mres.user.merchantId

$webhookSecret = 'whsec_demo_cevxutjck8cx0dwjabrry8'

# Get balances before
$mwalletBefore = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
$walletBefore = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE BEFORE: $($mwalletBefore.balance)"
Write-Host "ADMIN BALANCE BEFORE: $($walletBefore.balance)"

# --- PART 11: Insufficient wallet test ---
# Send a webhook for a $100 product but drain merchant wallet first
# Create a funding request for a huge amount that would drain admin wallet
# Actually, let's just send a webhook for a high-value product that exceeds merchant balance

Write-Host "`n--- PART 11: INSUFFICIENT WALLET TEST ---"
# Use $100 denomination but send 200 units (total $20,000) - exceeds merchant balance
$insOrderId = "wc-insufficient-$(Get-Random)"
$insEventId = "evt-ins-$(Get-Random)"
$insPayload = @{
    id = $insOrderId
    order_key = "wc_order_$insOrderId"
    status = "completed"
    payment_method = "stripe"
    billing = @{
        first_name = "Test"
        last_name = "Customer"
        email = "customer@test.com"
    }
    line_items = @(
        @{
            id = 1
            name = "PSN $100"
            sku = "PSN-USD-100"
            quantity = 200
            total = "20000.00"
        }
    )
    currency = "USD"
    total = "20000.00"
    date_created = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
} | ConvertTo-Json -Depth 5

# First create a connected product for PSN-USD-100
$psn = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/products' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
$psnProduct = $psn | Where-Object { $_.name -eq 'PSN' }

# Create connected product for PSN-USD-100 via a webhook sync
# Actually, let's just send the webhook - the system will create a connected product and try to map it
# But we need the connected product to have a dcvProductId mapped

# Let's create it directly via the connected products update endpoint
# First send a webhook to create the connected product, then map it
$syncHeaders = @{
    'X-Webhook-Secret' = $webhookSecret
    'X-WC-Webhook-Source' = 'https://demo-store.com'
    'X-WC-Webhook-Topic' = 'order.created'
    'X-Webhook-Event-Id' = "evt-sync-$(Get-Random)"
    'Content-Type' = 'application/json'
}

$syncPayload = @{
    id = "wc-sync-$(Get-Random)"
    status = "processing"
    billing = @{ first_name = "Sync"; last_name = "Test"; email = "sync@test.com" }
    line_items = @(@{ id = 1; name = "PSN $100"; sku = "PSN-USD-100"; quantity = 1; total = "100.00" })
    currency = "USD"
    total = "100.00"
} | ConvertTo-Json -Depth 5

try {
    $syncRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $syncPayload -Headers $syncHeaders -TimeoutSec 10
    Write-Host "Sync webhook sent"
} catch {
    Write-Host "Sync webhook error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 3

# Now map the connected product
$connected = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/connected-products' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
$psn100cp = $connected | Where-Object { $_.platformSku -eq 'PSN-USD-100' }
if ($psn100cp) {
    Write-Host "Found PSN-USD-100 connected product: $($psn100cp.id)"
    # Get PSN $100 denomination
    $denoms = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/$($psnProduct.id)/denominations" -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
    $d100 = $denoms | Where-Object { [decimal]$_.faceValue -eq 100 }
    if ($d100) {
        $mapBody = @{
            dcv_product_id = $psnProduct.id
            dcv_denomination_id = $d100.id
            inventory_source = 'DCV'
        } | ConvertTo-Json
        try {
            $mapRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/webhooks/connected-products/$($psn100cp.id)" -Method PUT -Body $mapBody -ContentType 'application/json' -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
            Write-Host "Mapped PSN-USD-100 to PSN $100 denomination"
        } catch {
            Write-Host "Map error: $($_.Exception.Message)"
            if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
        }
    }
} else {
    Write-Host "PSN-USD-100 connected product not found, trying to find it..."
    $connected | ForEach-Object { Write-Host "  SKU: $($_.platformSku)" }
}

# Now send the insufficient wallet webhook
$insHeaders = @{
    'X-Webhook-Secret' = $webhookSecret
    'X-WC-Webhook-Source' = 'https://demo-store.com'
    'X-WC-Webhook-Topic' = 'order.created'
    'X-Webhook-Event-Id' = $insEventId
    'Content-Type' = 'application/json'
}

Write-Host "Sending webhook for 200x PSN $100 = $20,000 (merchant has ~$11,950)"
try {
    $insRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/webhooks/incoming' -Method POST -Body $insPayload -Headers $insHeaders -TimeoutSec 10
    Write-Host "INSUFFICIENT WEBHOOK RESPONSE: $($insRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "INSUFFICIENT WEBHOOK ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep -Seconds 8

# Check balances - should be unchanged (insufficient wallet)
$mwalletIns = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
$walletIns = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER INSUFFICIENT: $($mwalletIns.balance) (should be unchanged: $($mwalletBefore.balance))"
Write-Host "ADMIN BALANCE AFTER INSUFFICIENT: $($walletIns.balance) (should be unchanged: $($walletBefore.balance))"

# --- PART 12: Funding rejection test ---
Write-Host "`n--- PART 12: FUNDING REJECTION TEST ---"

# Create a funding request
$fundBody = @{
    amount = 5000
    note = 'Test funding for rejection'
} | ConvertTo-Json
$fundRes = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/funding-requests' -Method POST -Body $fundBody -ContentType 'application/json' -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
Write-Host "FUNDING REQUEST CREATED: ID=$($fundRes.id) Status=$($fundRes.status) Amount=$($fundRes.amount)"

# Admin rejects it
$rejectBody = @{
    note = 'Rejected - insufficient admin funds for demo'
} | ConvertTo-Json
$rejectRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/admin/wallet/funding-requests/$($fundRes.id)/reject" -Method POST -Body $rejectBody -ContentType 'application/json' -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "FUNDING REJECTED: $($rejectRes | ConvertTo-Json -Compress)"

# Check balances unchanged after rejection
$mwalletRej = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/merchant/dashboard/wallet' -Method GET -Headers @{Authorization = "Bearer $mtoken"} -TimeoutSec 10
$walletRej = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "MERCHANT BALANCE AFTER REJECTION: $($mwalletRej.balance) (should be unchanged)"
Write-Host "ADMIN BALANCE AFTER REJECTION: $($walletRej.balance) (should be unchanged)"

# --- PART 13: Reconciliation ---
Write-Host "`n--- PART 13: RECONCILIATION REPORT ---"
$recon = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/admin/wallet/reconciliation?limit=100&offset=0' -Method GET -Headers @{Authorization = "Bearer $atoken"} -TimeoutSec 10
Write-Host "Reconciliation Summary: $($recon.summary | ConvertTo-Json -Compress)"
if ($recon.items) {
    Write-Host "Items count: $($recon.items.Count)"
    foreach ($item in $recon.items) {
        Write-Host "  Order: $($item.orderId) | Merchant: $($item.merchantDebit) | Admin: $($item.adminCredit) | Matched: $($item.matched)"
    }
}

Write-Host "`n=== ALL FINANCIAL EDGE CASE TESTS COMPLETE ==="
