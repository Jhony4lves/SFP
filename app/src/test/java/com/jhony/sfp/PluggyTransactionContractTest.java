package com.jhony.sfp;

import org.json.JSONObject;
import org.junit.Test;
import java.lang.reflect.Method;
import static org.junit.Assert.*;

public class PluggyTransactionContractTest {
    private JSONObject summarize(String raw) throws Exception {
        Method method = PluggyBridge.class.getDeclaredMethod("summarizeTransaction", JSONObject.class);
        method.setAccessible(true);
        return (JSONObject) method.invoke(null, new JSONObject(raw));
    }

    @Test public void preservesDocumentedNestedBillWithoutLeakingCardNumber() throws Exception {
        JSONObject tx = summarize("{\"id\":\"purchase\",\"amount\":170.84,\"status\":\"POSTED\","
                + "\"creditCardMetadata\":{\"billId\":\"september-bill\",\"cardNumber\":\"private-card\","
                + "\"installmentNumber\":2,\"totalInstallments\":3}}");
        assertEquals("september-bill", tx.getString("billId"));
        assertEquals(170.84, tx.getDouble("amount"), .001);
        assertEquals(2, tx.getJSONObject("installment").getInt("installmentNumber"));
        assertFalse(tx.toString().contains("private-card"));
    }

    @Test public void pendingPaymentStaysPendingAndKeepsItsBill() throws Exception {
        JSONObject tx = summarize("{\"amount\":-70.65,\"type\":\"CREDIT\",\"status\":\"PENDING\","
                + "\"creditCardMetadata\":{\"billId\":\"september-bill\"}}");
        assertEquals("PENDING", tx.getString("status"));
        assertEquals(-70.65, tx.getDouble("amount"), .001);
        assertEquals("september-bill", tx.getString("billId"));
    }

    @Test public void legacyRootBillStillWorksWithoutMetadata() throws Exception {
        assertEquals("legacy-bill", summarize("{\"billId\":\"legacy-bill\"}").getString("billId"));
        assertFalse(summarize("{}").has("billId"));
    }

    @Test public void documentedMetadataPrecedesLegacyRoot() throws Exception {
        assertEquals("bank-bill", summarize("{\"billId\":\"old-bill\","
                + "\"creditCardMetadata\":{\"billId\":\"bank-bill\"}}").getString("billId"));
    }
}
