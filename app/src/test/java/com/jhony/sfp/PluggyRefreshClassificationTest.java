package com.jhony.sfp;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PluggyRefreshClassificationTest {
    @Test public void meuPluggyManagedRefreshIsNotGenericHttp400() {
        assertTrue(PluggyRefreshBridge.isMeuPluggyManagedFailure(
                400, "MeuPluggy item cant be updated"));
        assertEquals("REFRESH_PROVIDER_MANAGED",
                PluggyRefreshBridge.classifyRefreshFailure(
                        400, "", "MeuPluggy item cant be updated"));
    }

    @Test public void staleItemIsClassifiedForAutomaticCleanup() {
        assertEquals("REFRESH_ITEM_NOT_FOUND",
                PluggyRefreshBridge.classifyRefreshFailure(
                        404, "", "item not found"));
    }

    @Test public void userActionAndRateLimitStayDistinct() {
        assertTrue(PluggyRefreshBridge.needsUserAction(
                "MFA_REQUIRED", "Waiting user input"));
        assertEquals("REFRESH_NEEDS_USER",
                PluggyRefreshBridge.classifyRefreshFailure(
                        400, "MFA_REQUIRED", "Waiting user input"));
        assertEquals("REFRESH_RATE_LIMITED",
                PluggyRefreshBridge.classifyRefreshFailure(
                        429, "BEFORE_ALLOWED_FREQUENCY", "Try later"));
    }

    @Test public void ordinaryConflictRemainsAttentionRequired() {
        assertFalse(PluggyRefreshBridge.isMeuPluggyManagedFailure(
                409, "Conflict"));
        assertEquals("REFRESH_NEEDS_ATTENTION",
                PluggyRefreshBridge.classifyRefreshFailure(
                        409, "", "Conflict"));
    }
}
