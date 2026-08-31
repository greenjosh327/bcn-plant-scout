import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminSessionHandoffUrl,
  consumeAdminSessionHandoff
} from "../lib/admin-session-handoff";

describe("BCN admin session handoff", () => {
  it("passes a session only through the fragment of an approved admin URL", () => {
    const result = new URL(buildAdminSessionHandoffUrl("https://scout.basecampnorthpa.com/admin", {
      access_token: "access-token",
      refresh_token: "refresh-token"
    }));
    const fragment = new URLSearchParams(result.hash.slice(1));

    assert.equal(result.origin, "https://scout.basecampnorthpa.com");
    assert.equal(result.pathname, "/admin");
    assert.equal(result.search, "");
    assert.equal(fragment.get("bcn_admin_handoff"), "1");
    assert.equal(fragment.get("bcn_access_token"), "access-token");
    assert.equal(fragment.get("bcn_refresh_token"), "refresh-token");
  });

  it("consumes and removes handoff credentials from an approved admin URL", () => {
    const handoffUrl = buildAdminSessionHandoffUrl("https://basecampnorthpa.com/admin/etsy", {
      access_token: "access-token",
      refresh_token: "refresh-token"
    });
    const result = consumeAdminSessionHandoff(handoffUrl);

    assert.deepEqual(result?.session, {
      access_token: "access-token",
      refresh_token: "refresh-token"
    });
    assert.equal(result?.cleanUrl, "https://basecampnorthpa.com/admin/etsy");
  });

  it("rejects non-admin and non-BCN destinations", () => {
    const session = { access_token: "access-token", refresh_token: "refresh-token" };

    assert.throws(() => buildAdminSessionHandoffUrl("https://example.com/admin", session));
    assert.throws(() => buildAdminSessionHandoffUrl("https://basecampnorthpa.com/shop", session));
    assert.throws(() => buildAdminSessionHandoffUrl("https://basecampnorthpa.com/administrator", session));
    assert.equal(consumeAdminSessionHandoff("https://example.com/admin#bcn_admin_handoff=1"), null);
  });

  it("clears an incomplete handoff without accepting a session", () => {
    const result = consumeAdminSessionHandoff(
      "https://basecampnorthpa.com/admin#bcn_admin_handoff=1&bcn_access_token=access-token"
    );

    assert.equal(result?.session, null);
    assert.equal(result?.cleanUrl, "https://basecampnorthpa.com/admin");
  });
});
