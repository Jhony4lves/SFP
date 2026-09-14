package com.jhony.sfp;

import java.util.Locale;

/** Provider lifecycle classification shared by the native bridge and its JVM regression test. */
final class PluggyRefreshState {
    final boolean complete;
    final boolean needsUser;
    final boolean failed;

    PluggyRefreshState(String status, String executionStatus) {
        String s = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        String e = executionStatus == null ? "" : executionStatus.trim().toUpperCase(Locale.ROOT);
        needsUser = s.equals("WAITING_USER_INPUT") || s.equals("LOGIN_ERROR")
                || e.equals("WAITING_USER_INPUT") || e.equals("USER_AUTHORIZATION_PENDING")
                || e.equals("INVALID_CREDENTIALS") || e.equals("INVALID_CREDENTIALS_MFA")
                || e.equals("ACCOUNT_LOCKED") || e.equals("ACCOUNT_NEEDS_ACTION")
                || e.equals("ACCOUNT_CREDENTIALS_RESET")
                || e.equals("USER_AUTHORIZATION_NOT_GRANTED") || e.equals("USER_AUTHORIZATION_REVOKED");
        boolean running = s.equals("UPDATING") || e.equals("CREATED")
                || e.endsWith("_IN_PROGRESS") || e.equals("MERGING") || e.equals("RUNNING");
        failed = !running && !needsUser && (s.equals("OUTDATED")
                || e.equals("PARTIAL_SUCCESS") || e.equals("ERROR") || e.endsWith("_ERROR")
                || e.equals("SITE_NOT_AVAILABLE") || e.equals("USER_INPUT_TIMEOUT")
                || e.equals("ALREADY_LOGGED_IN") || e.equals("USER_NOT_SUPPORTED"));
        complete = !running && !needsUser && !failed && s.equals("UPDATED")
                && (e.isEmpty() || e.equals("SUCCESS"));
    }
}
