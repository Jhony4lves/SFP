package com.jhony.sfp;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public class PluggyLiveBalanceMergeTest {
    @Test
    public void liveBalanceCrossesNativePreviewBoundaryWithoutLosingAccountSnapshot() throws Exception {
        JSONObject account = new JSONObject()
                .put("id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
                .put("balance", 532.22)
                .put("updatedAt", "2026-09-22T18:00:00.000Z");
        JSONObject live = new JSONObject()
                .put("ok", true)
                .put("balance", 274.82)
                .put("updateDateTime", "2026-09-23T12:20:00.000Z")
                .put("readAt", "2026-09-23T12:20:01.000Z");

        JSONObject merged = PluggyBridge.mergeLiveBalance(account, live);

        assertEquals(274.82, merged.getDouble("balance"), 0.001);
        assertEquals(274.82, merged.getDouble("liveBalance"), 0.001);
        assertEquals(532.22, merged.getDouble("accountBalance"), 0.001);
        assertEquals("live-balance", merged.getString("balanceEvidence"));
        assertEquals("2026-09-23T12:20:00.000Z", merged.getString("liveBalanceUpdatedAt"));
        assertEquals("2026-09-23T12:20:01.000Z", merged.getString("liveBalanceReadAt"));
    }
}
