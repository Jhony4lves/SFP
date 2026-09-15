package com.jhony.sfp;

import org.json.JSONArray;
import org.json.JSONObject;

/** Only export the provider's error explanation, never its raw response or authentication material. */
final class PluggyRefreshError {
    final String code;
    final String message;

    PluggyRefreshError(String body, String apiKey) {
        String foundCode = "", foundMessage = "";
        try {
            JSONObject root = new JSONObject(body);
            JSONObject error = root.optJSONObject("error");
            JSONObject detail = error == null ? root : error;
            foundCode = detail.optString("code", detail.optString("errorCode", ""));
            Object value = detail.opt("message");
            if (value instanceof String) foundMessage = (String) value;
            else if (value instanceof JSONArray) {
                JSONArray messages = (JSONArray) value;
                for (int i = 0; i < Math.min(messages.length(), 3); i++) {
                    if (messages.opt(i) instanceof String) foundMessage += (foundMessage.isEmpty() ? "" : "; ") + messages.getString(i);
                }
            }
            if (foundMessage.isEmpty() && root.opt("error") instanceof String) foundMessage = root.getString("error");
        } catch (Exception ignored) { }
        code = foundCode.matches("[A-Z][A-Z0-9_:-]{0,79}") ? foundCode : "";
        message = sanitize(foundMessage, apiKey);
    }

    static String sanitize(String value, String apiKey) {
        if (value == null) return "";
        String text = value;
        if (apiKey != null && !apiKey.isEmpty()) text = text.replace(apiKey, "[redacted]");
        text = text.replaceAll("(?i)(bearer\\s+|(?:api[_ -]?key|token|secret|password)\\s*[:=]\\s*)[^\\s,;]+", "$1[redacted]");
        text = text.replaceAll("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "[redacted]");
        text = text.replaceAll("[a-zA-Z0-9_+/=-]{24,}", "[redacted]");
        text = text.replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.substring(0, Math.min(text.length(), 300));
    }
}
