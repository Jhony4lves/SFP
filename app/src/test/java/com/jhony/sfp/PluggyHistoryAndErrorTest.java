package com.jhony.sfp;

import org.junit.Test;
import org.json.JSONObject;
import java.time.LocalDate;
import static org.junit.Assert.*;

public class PluggyHistoryAndErrorTest {
    @Test public void extendedHistoryKeepsCurrentInstallmentsWithoutImportingOldBills() throws Exception {
        LocalDate today = LocalDate.of(2026, 9, 15);
        JSONObject july = new JSONObject().put("date", "2026-07-06T00:00:00.000Z").put("status", "PENDING").put("billForecastDate", "2026-09");
        assertTrue(PluggyBridge.keepCreditTransaction(july, today));
        july.put("date", "2026-07-28T00:00:00.000Z").put("status", "POSTED");
        assertTrue(PluggyBridge.keepCreditTransaction(july, today));
        july.put("billForecastDate", "2026-08");
        assertFalse(PluggyBridge.keepCreditTransaction(july, today));
        july.remove("billForecastDate");
        assertFalse(PluggyBridge.keepCreditTransaction(july, today));
        july.put("date", "2026-09-01T00:00:00.000Z");
        assertTrue(PluggyBridge.keepCreditTransaction(july, today));
    }
    @Test public void creditHistoryIncludesJulyInstallmentsInSeptember() {
        LocalDate today = LocalDate.of(2026, 9, 15);
        LocalDate start = PluggyBridge.transactionHistoryStart(today, "CREDIT");
        assertEquals(LocalDate.of(2025, 9, 15), start);
        assertFalse(LocalDate.of(2026, 7, 6).isBefore(start));
        assertFalse(LocalDate.of(2026, 7, 28).isBefore(start));
        assertEquals(today.minusDays(45), PluggyBridge.transactionHistoryStart(today, "BANK"));
    }
    @Test public void messageOnlyHttp400IsNotDiscarded() {
        PluggyRefreshError error = new PluggyRefreshError("{\"message\":\"Connector does not support updates\"}", "private-key");
        assertEquals("Connector does not support updates", error.message);
        assertEquals("", error.code);
    }
    @Test public void nestedErrorAndValidationArrayAreReadable() {
        PluggyRefreshError error = new PluggyRefreshError("{\"error\":{\"code\":\"VALIDATION_ERROR\",\"message\":[\"First reason\",\"Second reason\"]}}", "");
        assertEquals("VALIDATION_ERROR", error.code);
        assertEquals("First reason; Second reason", error.message);
    }
    @Test public void diagnosticsRedactKeysIdentifiersAndEmail() {
        String message = PluggyRefreshError.sanitize("Item 11111111-1111-4111-8111-111111111111 for person@example.com denied private-key token=short-secret", "private-key");
        assertFalse(message.contains("11111111"));
        assertFalse(message.contains("person@example.com"));
        assertFalse(message.contains("private-key"));
        assertFalse(message.contains("short-secret"));
        assertTrue(message.contains("denied"));
    }
}
