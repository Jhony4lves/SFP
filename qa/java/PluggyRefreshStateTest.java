package com.jhony.sfp;

public final class PluggyRefreshStateTest {
    private static void check(String status, String execution, boolean complete, boolean needsUser, boolean failed) {
        PluggyRefreshState state = new PluggyRefreshState(status, execution);
        if (state.complete != complete || state.needsUser != needsUser || state.failed != failed)
            throw new AssertionError(status + " / " + execution);
    }
    public static void main(String[] args) {
        check("UPDATED", "SUCCESS", true, false, false);
        check("UPDATED", "", true, false, false);
        check("updated", "success", true, false, false);
        check("UPDATING", "SUCCESS", false, false, false);
        check("UPDATING", "TRANSACTIONS_IN_PROGRESS", false, false, false);
        check("UPDATING", "LOGIN_MFA_IN_PROGRESS", false, false, false);
        check("WAITING_USER_INPUT", "WAITING_USER_INPUT", false, true, false);
        check("LOGIN_ERROR", "INVALID_CREDENTIALS", false, true, false);
        check("OUTDATED", "ACCOUNT_NEEDS_ACTION", false, true, false);
        check("OUTDATED", "ERROR", false, false, true);
        check("UPDATED", "PARTIAL_SUCCESS", false, false, true);
        check("UPDATED", "MERGING", false, false, false);
        check("", "", false, false, false);
        check("UNKNOWN", "SUCCESS", false, false, false);
        System.out.println("14 native refresh lifecycle regressions passed");
    }
}
