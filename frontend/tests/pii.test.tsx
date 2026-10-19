import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PiiWarning } from "@/components/shared/PiiWarning";
import { detectPii } from "@/lib/pii";

describe("detectPii", () => {
  it.each([
    ["I live at N4 3HF", "postcode"],
    ["near sw1a1aa", "postcode"],
    ["12 Elm Road, then the Piccadilly", "house_number"],
    ["4a Station Close", "house_number"],
    ["flat 3 above the shop", "house_number"],
    ["email me at owl@ucl.ac.uk", "email"],
    ["text 07700 900123", "phone"],
  ])("flags %j as %s", (text, kind) => {
    expect(detectPii(text).map((f) => f.kind)).toContain(kind);
  });

  it.each([
    "I leave King's Cross around 9:15pm on the Piccadilly line to Acton Town",
    "Zone 4, usually the 23:40 from Holborn on Fridays",
    "Home is near Walthamstow Central, N17 area",
    "Leave at 10.30 on Tuesdays and Thursdays",
    "Hounslow West on the Piccadilly, Thursdays 11pm",
  ])("does not flag ordinary commute text: %j", (text) => {
    expect(detectPii(text)).toEqual([]);
  });
});

function Harness() {
  const [text, setText] = useState("");
  return (
    <>
      <label htmlFor="t">Commute</label>
      <textarea id="t" value={text} onChange={(e) => setText(e.target.value)} />
      <PiiWarning id="w" text={text} />
    </>
  );
}

describe("<PiiWarning>", () => {
  it("warns as soon as a postcode is typed and clears when it is removed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByLabelText("Commute");

    await user.type(box, "Home to Acton Town, ");
    expect(screen.queryByText(/remove it before continuing/i)).not.toBeInTheDocument();

    await user.type(box, "W3 8HN");
    expect(screen.getByText(/a full postcode/i)).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "Home to Acton Town");
    expect(screen.queryByText(/remove it before continuing/i)).not.toBeInTheDocument();
  });
});
