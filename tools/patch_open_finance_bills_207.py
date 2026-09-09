from pathlib import Path

java = Path('app/src/main/java/com/jhony/sfp/PluggyBridge.java')
s = java.read_text()

s = s.replace('|| "/accounts".equals(path)\n                || "/v2/items".equals(path)', '|| "/accounts".equals(path)\n                || "/bills".equals(path)\n                || "/v2/items".equals(path)')
s = s.replace('OpenFinance/1.2', 'OpenFinance/1.3')
s = s.replace('        summary.put("type", cleanString(transaction, "type"));\n        copyOptionalNumber(transaction, summary, "amount");', '        summary.put("type", cleanString(transaction, "type"));\n        String billId = cleanString(transaction, "billId");\n        if (!billId.isEmpty()) summary.put("billId", billId);\n        copyOptionalNumber(transaction, summary, "amount");')

marker = '    private JSONArray discoverItemsInternal(String key) throws Exception {'
bill_summary = r'''    private static JSONObject summarizeBill(JSONObject bill) throws Exception {
        JSONObject summary = new JSONObject();
        summary.put("id", cleanString(bill, "id"));
        summary.put("dueDate", cleanString(bill, "dueDate"));
        String closeDate = cleanString(bill, "billClosingDate");
        if (!closeDate.isEmpty()) summary.put("billClosingDate", closeDate);
        copyOptionalNumber(bill, summary, "totalAmount");
        summary.put("totalAmountCurrencyCode", cleanFirst(cleanString(bill, "totalAmountCurrencyCode"), "BRL"));
        copyOptionalNumber(bill, summary, "minimumPaymentAmount");
        if (bill.has("allowsInstallments") && !bill.isNull("allowsInstallments")) {
            summary.put("allowsInstallments", bill.optBoolean("allowsInstallments", false));
        }

        JSONArray sourcePayments = bill.optJSONArray("payments");
        JSONArray payments = new JSONArray();
        if (sourcePayments != null) {
            for (int index = 0; index < sourcePayments.length(); index++) {
                JSONObject payment = sourcePayments.optJSONObject(index);
                if (payment == null) continue;
                JSONObject safe = new JSONObject();
                safe.put("id", cleanString(payment, "id"));
                safe.put("valueType", cleanString(payment, "valueType"));
                safe.put("paymentDate", cleanString(payment, "paymentDate"));
                safe.put("paymentMode", cleanString(payment, "paymentMode"));
                copyOptionalNumber(payment, safe, "amount");
                safe.put("currencyCode", cleanFirst(cleanString(payment, "currencyCode"), "BRL"));
                payments.put(safe);
            }
        }
        summary.put("payments", payments);

        JSONArray sourceCharges = bill.optJSONArray("financeCharges");
        JSONArray charges = new JSONArray();
        if (sourceCharges != null) {
            for (int index = 0; index < sourceCharges.length(); index++) {
                JSONObject charge = sourceCharges.optJSONObject(index);
                if (charge == null) continue;
                JSONObject safe = new JSONObject();
                safe.put("id", cleanString(charge, "id"));
                safe.put("type", cleanString(charge, "type"));
                copyOptionalNumber(charge, safe, "amount");
                safe.put("currencyCode", cleanFirst(cleanString(charge, "currencyCode"), "BRL"));
                String info = cleanString(charge, "additionalInfo");
                if (!info.isEmpty()) safe.put("additionalInfo", info);
                charges.put(safe);
            }
        }
        summary.put("financeCharges", charges);
        return summary;
    }

'''
if 'private static JSONObject summarizeBill' not in s:
    if marker not in s:
        raise SystemExit('discover marker missing')
    s = s.replace(marker, bill_summary + marker)

marker2 = '    private JSONObject listRecentTransactionsInternal(String key, String accountId) throws Exception {'
list_bills = r'''    private JSONArray listBillsInternal(String key, String accountId) throws Exception {
        if (!UUID_PATTERN.matcher(accountId).matches()) throw new IllegalArgumentException("INVALID_ACCOUNT_ID");
        String query = "accountId=" + URLEncoder.encode(accountId, StandardCharsets.UTF_8.name());
        HttpResult response = request("GET", "/bills", query, null, key);
        if (response.status == 401) {
            apiKey = null;
            apiKeyExpiresAtMs = 0L;
            throw new SecurityException("API_KEY_REJECTED");
        }
        if (response.status == 403 || response.status == 404) return new JSONArray();
        if (response.status < 200 || response.status >= 300) {
            throw new IllegalStateException("BILLS_HTTP_" + response.status);
        }
        JSONArray source = extractCollection(response.body);
        JSONArray result = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject bill = source.optJSONObject(index);
            if (bill != null) result.put(summarizeBill(bill));
        }
        return result;
    }

'''
if 'private JSONArray listBillsInternal' not in s:
    if marker2 not in s:
        raise SystemExit('transactions marker missing')
    s = s.replace(marker2, list_bills + marker2)

s = s.replace('            int transactionPreviewCount = 0;\n', '            int transactionPreviewCount = 0;\n            int billCount = 0;\n')
block = '''                    } catch (Exception transactionError) {
                        enriched.put("transactions", new JSONArray());
                        enriched.put("transactionsError", true);
                    }
                    enrichedAccounts.put(enriched);
'''
replacement = '''                    } catch (Exception transactionError) {
                        enriched.put("transactions", new JSONArray());
                        enriched.put("transactionsError", true);
                    }
                    if ("CREDIT".equalsIgnoreCase(cleanString(account, "type"))) {
                        try {
                            JSONArray bills = listBillsInternal(key, accountId);
                            enriched.put("bills", bills);
                            enriched.put("billsAvailable", true);
                            billCount += bills.length();
                        } catch (Exception billError) {
                            enriched.put("bills", new JSONArray());
                            enriched.put("billsError", true);
                        }
                    }
                    enrichedAccounts.put(enriched);
'''
if 'enriched.put("bills", bills);' not in s:
    if block not in s:
        raise SystemExit('enrichment block missing')
    s = s.replace(block, replacement)

s = s.replace('            result.put("transactionPreviewCount", transactionPreviewCount);\n            result.put("transactionWindowDays", TRANSACTION_WINDOW_DAYS);', '            result.put("transactionPreviewCount", transactionPreviewCount);\n            result.put("billCount", billCount);\n            result.put("transactionWindowDays", TRANSACTION_WINDOW_DAYS);')
java.write_text(s)

safe = Path('app/src/main/assets/www/safe-spend.js')
t = safe.read_text()
loader = '''\n\n(function loadOpenFinanceBills(){\n  if(typeof document==='undefined'||document.querySelector('script[data-sfp-open-finance-bills="1"]'))return;\n  const script=document.createElement('script');\n  script.src='open-finance-bills.js';\n  script.async=false;\n  script.dataset.sfpOpenFinanceBills='1';\n  document.head.appendChild(script);\n})();\n'''
if 'data-sfp-open-finance-bills' not in t:
    t += loader
safe.write_text(t)
