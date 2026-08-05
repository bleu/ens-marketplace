import { describe, expect, it } from "vitest";

import { formatTokenAmount, displayableEnsName } from "./format";

describe("formatTokenAmount", () => {
  const eth = (value: bigint) => formatTokenAmount(value, 18);

  it("drops the dust tail an 18-decimal price carries", () => {
    expect(eth(43912830000000001n)).toBe("0.0439");
  });

  it("keeps three decimals once past 1 ETH, and no trailing zeros", () => {
    expect(eth(1500000000000000000n)).toBe("1.5");
    expect(eth(12345600000000000000n)).toBe("12.346");
  });

  it("separates thousands and drops the fraction on big numbers", () => {
    expect(eth(1234500000000000000000n)).toBe("1,235");
  });

  /// Rounding to four decimals would print "0.0000", which reads as free.
  it("marks an amount too small to show rather than rounding it to zero", () => {
    expect(eth(1000000000n)).toBe("<0.0001");
  });

  it("shows a plain zero for zero", () => {
    expect(eth(0n)).toBe("0");
  });

  it("respects the token's own decimals", () => {
    expect(formatTokenAmount(2500000n, 6)).toBe("2.5");
  });
});

describe("displayableEnsName", () => {
  it("shows a name that is already in normalized form", () => {
    expect(displayableEnsName("nick.eth")).toBe("nick.eth");
  });

  /// The impersonation case, and the reason this gate returns `raw` rather than the
  /// normalized form: a resolver can hand back "ni​ck.eth", which normalizes
  /// cleanly to "nick.eth". Displaying that normalized result would show Nick's name
  /// for someone else's address.
  it("hides a name that normalizes to something other than itself", () => {
    expect(displayableEnsName("ni​ck.eth")).toBeNull();
  });

  /// ens_normalize throws rather than returning a different string for these, so the
  /// gate has to survive an exception, not just an inequality.
  it("hides a name carrying a right-to-left override", () => {
    expect(displayableEnsName("vitalik‮.eth")).toBeNull();
  });

  it("hides a name mixing scripts (Cyrillic 'а' in a Latin word)", () => {
    expect(displayableEnsName("аpple.eth")).toBeNull();
  });

  it("hides an unnormalized but harmless name rather than lowercasing it", () => {
    expect(displayableEnsName("Nick.eth")).toBeNull();
  });

  /// Non-ASCII isn't itself suspicious — an accented name in normalized form still shows.
  it("shows a normalized non-ASCII name", () => {
    expect(displayableEnsName("níck.eth")).toBe("níck.eth");
  });

  /// No name found (wagmi's useEnsName resolves to null) and the empty-string edge, which
  /// normalize accepts but which would render as a blank label.
  it("has nothing to show for null or an empty string", () => {
    expect(displayableEnsName(null)).toBeNull();
    expect(displayableEnsName("")).toBeNull();
  });
});
